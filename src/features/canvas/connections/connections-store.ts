import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
	type CanvasConnection,
	type CanvasPanelType,
	deleteCanvasConnection,
	saveCanvasConnection,
} from "@/lib/api";

// Transient canvas-connection state for the active workspace. Hydrated from the
// loaded canvas snapshot; every mutation writes through to the DB (which
// broadcasts `canvasChanged`). One canvas is active at a time, so a single
// flat list is enough.

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

type PendingSource = { id: string; panelType: CanvasPanelType };

type ConnectionsStore = {
	workspaceId: string | null;
	connections: CanvasConnection[];
	/** Panel the user is currently connecting FROM (click-to-connect), or null
	 * when not in connect mode. */
	pendingSource: PendingSource | null;

	hydrate: (workspaceId: string, connections: CanvasConnection[]) => void;
	startConnect: (sourcePanelId: string, panelType: CanvasPanelType) => void;
	cancelConnect: () => void;
	/** Complete a click-to-connect against `targetPanelId`. No-op for self or an
	 * already-existing identical edge. Kind derives from both endpoints. */
	completeConnect: (targetPanelId: string, targetType: CanvasPanelType) => void;
	disconnect: (connectionId: string) => void;
	/** Mark one conversation→terminal edge as the routing target, clearing the
	 * primary flag on the source's other terminal edges. */
	setPrimaryTerminal: (sourcePanelId: string, connectionId: string) => void;
	/** Drop every edge touching a deleted panel from local state (the backend
	 * cascade already removed them server-side). */
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
	pendingSource: null,

	hydrate: (workspaceId, connections) =>
		set({ workspaceId, connections, pendingSource: null }),

	startConnect: (sourcePanelId, panelType) =>
		set({ pendingSource: { id: sourcePanelId, panelType } }),
	cancelConnect: () => set({ pendingSource: null }),

	completeConnect: (targetPanelId, targetType) => {
		const { pendingSource, connections, workspaceId } = get();
		if (!pendingSource || !workspaceId || pendingSource.id === targetPanelId) {
			set({ pendingSource: null });
			return;
		}
		const exists = connections.some(
			(c) =>
				c.fromPanelId === pendingSource.id && c.toPanelId === targetPanelId,
		);
		if (exists) {
			set({ pendingSource: null });
			return;
		}
		const connection: CanvasConnection = {
			id: crypto.randomUUID(),
			workspaceId,
			fromPanelId: pendingSource.id,
			toPanelId: targetPanelId,
			kind: deriveKind(pendingSource.panelType, targetType),
			meta: null,
			createdAt: "",
		};
		set({
			connections: [...connections, connection],
			pendingSource: null,
		});
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
