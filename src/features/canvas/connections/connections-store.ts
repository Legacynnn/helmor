import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
	type CanvasConnection,
	type CanvasPanelType,
	deleteCanvasConnection,
	saveCanvasConnection,
} from "@/lib/api";

// Transient canvas-connection state for the active workspace. Hydrated from the
// loaded snapshot; every mutation writes through to the DB (which broadcasts
// `canvasChanged`). Connecting is driven by React Flow's native handle-drag
// (`onConnect`); this store owns the persisted edge list + semantics.

export type ConnectionKind =
	| "generic"
	| "conversation-terminal"
	| "conversation-conversation";

/** Meta persisted in `canvas_connections.meta` (opaque JSON). */
export type ConnectionMeta = {
	/** For a conversation→terminal edge: this terminal is the routing target
	 * ("run with a specific terminal"). At most one primary per source. */
	primary?: boolean;
};

/** Resolve the edge kind from both endpoint panel types. */
export function deriveKind(
	from: CanvasPanelType,
	to: CanvasPanelType,
): ConnectionKind {
	if (from === "conversation" && to === "terminal")
		return "conversation-terminal";
	if (from === "conversation" && to === "conversation")
		return "conversation-conversation";
	return "generic";
}

type ConnectionsStore = {
	workspaceId: string | null;
	connections: CanvasConnection[];

	hydrate: (workspaceId: string, connections: CanvasConnection[]) => void;
	/** Create an edge (from React Flow `onConnect`). No-op for self / duplicate
	 * edges. Kind derives from both endpoint types. */
	addConnection: (
		fromPanelId: string,
		toPanelId: string,
		fromType: CanvasPanelType,
		toType: CanvasPanelType,
	) => void;
	disconnect: (connectionId: string) => void;
	/** Mark one conversation→terminal edge as the routing target, clearing the
	 * primary flag on the source's other terminal edges. */
	setPrimaryTerminal: (sourcePanelId: string, connectionId: string) => void;
	/** Drop every edge touching a deleted panel (the backend cascade already
	 * removed them server-side). */
	pruneForPanel: (panelId: string) => void;
};

function parseMeta(raw: string | null | undefined): ConnectionMeta {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object"
			? (parsed as ConnectionMeta)
			: {};
	} catch {
		return {};
	}
}

export function connectionMeta(conn: CanvasConnection): ConnectionMeta {
	return parseMeta(conn.meta);
}

export const useConnectionsStore = create<ConnectionsStore>((set, get) => ({
	workspaceId: null,
	connections: [],

	hydrate: (workspaceId, connections) => set({ workspaceId, connections }),

	addConnection: (fromPanelId, toPanelId, fromType, toType) => {
		const { connections, workspaceId } = get();
		if (!workspaceId || fromPanelId === toPanelId) return;
		const exists = connections.some(
			(c) => c.fromPanelId === fromPanelId && c.toPanelId === toPanelId,
		);
		if (exists) return;
		const connection: CanvasConnection = {
			id: crypto.randomUUID(),
			workspaceId,
			fromPanelId,
			toPanelId,
			kind: deriveKind(fromType, toType),
			meta: null,
			createdAt: "",
		};
		set({ connections: [...connections, connection] });
		void saveCanvasConnection(connection).catch(() => {});
	},

	disconnect: (connectionId) => {
		const { connections, workspaceId } = get();
		if (!workspaceId) return;
		set({ connections: connections.filter((c) => c.id !== connectionId) });
		void deleteCanvasConnection(workspaceId, connectionId).catch(() => {});
	},

	setPrimaryTerminal: (sourcePanelId, connectionId) => {
		const { connections } = get();
		const affected = connections.filter(
			(c) =>
				c.fromPanelId === sourcePanelId && c.kind === "conversation-terminal",
		);
		const next = connections.map((c) => {
			if (!affected.includes(c)) return c;
			const meta: ConnectionMeta = { primary: c.id === connectionId };
			return { ...c, meta: JSON.stringify(meta) };
		});
		set({ connections: next });
		for (const c of next) {
			if (affected.some((a) => a.id === c.id)) {
				void saveCanvasConnection(c).catch(() => {});
			}
		}
	},

	pruneForPanel: (panelId) =>
		set((s) => ({
			connections: s.connections.filter(
				(c) => c.fromPanelId !== panelId && c.toPanelId !== panelId,
			),
		})),
}));

/** Edges where `panelId` is an endpoint (either direction). */
export function useConnectionsForPanel(panelId: string): {
	outgoing: CanvasConnection[];
	incoming: CanvasConnection[];
} {
	return useConnectionsStore(
		useShallow((s) => ({
			outgoing: s.connections.filter((c) => c.fromPanelId === panelId),
			incoming: s.connections.filter((c) => c.toPanelId === panelId),
		})),
	);
}
