import { type NodeChange, useNodesState, useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { closeTerminal } from "@/features/terminal/terminal-session-store";
import {
	type CanvasPanel,
	type CanvasPanelType,
	type CanvasState,
	createSession,
	deleteCanvasPanel,
	saveCanvasPanel,
} from "@/lib/api";
import type { CanvasActions } from "./canvas-actions-context";
import { useConnectionsStore } from "./connections/connections-store";
import {
	type PanelConfig,
	parsePanelConfig,
	stringifyPanelConfig,
} from "./panel-config";
import {
	PANEL_DEFAULT_HEIGHT,
	PANEL_DEFAULT_WIDTH,
	PANEL_DRAG_HANDLE_CLASS,
	type PanelNode,
	type PanelNodeData,
} from "./types";

const PERSIST_DEBOUNCE_MS = 350;
const DRAG_HANDLE = `.${PANEL_DRAG_HANDLE_CLASS}`;

function panelToNode(p: CanvasPanel): PanelNode {
	return {
		id: p.id,
		type: "panel",
		position: { x: p.x, y: p.y },
		width: p.width,
		height: p.height,
		zIndex: p.z,
		dragHandle: DRAG_HANDLE,
		draggable: !p.locked,
		data: {
			panelType: p.panelType,
			title: p.title ?? "",
			config: p.config ?? "{}",
			locked: p.locked,
		},
	};
}

function nodeToPanel(node: PanelNode, workspaceId: string): CanvasPanel {
	return {
		id: node.id,
		workspaceId,
		panelType: node.data.panelType,
		x: node.position.x,
		y: node.position.y,
		width: node.width ?? node.measured?.width ?? PANEL_DEFAULT_WIDTH,
		height: node.height ?? node.measured?.height ?? PANEL_DEFAULT_HEIGHT,
		z: node.zIndex ?? 0,
		locked: node.data.locked,
		title: node.data.title,
		config: node.data.config,
		createdAt: "",
		updatedAt: "",
	};
}

/** Build the config for a freshly created panel, provisioning live bindings. */
async function buildConfig(
	type: CanvasPanelType,
	workspaceId: string,
	override?: Partial<PanelConfig>,
): Promise<{ config: string }> {
	let base: PanelConfig = {};
	if (type === "conversation") {
		// Reuse an existing session when one is supplied (e.g. importing the
		// workspace's open sessions); otherwise spawn a fresh one.
		const sessionId =
			override?.sessionId ?? (await createSession(workspaceId)).sessionId;
		base = { sessionId };
	} else if (type === "terminal") {
		base = { instanceId: override?.instanceId ?? crypto.randomUUID() };
	}
	return { config: stringifyPanelConfig({ ...base, ...override }) };
}

export type CanvasGraph = {
	nodes: PanelNode[];
	onNodesChange: (changes: NodeChange<PanelNode>[]) => void;
	actions: CanvasActions;
	reconcile: (state: CanvasState) => void;
};

/** Owns the React Flow node graph for one workspace: hydration, debounced
 * persistence of geometry/data, the mutating {@link CanvasActions}, and
 * idempotent reconciliation of external (CLI) mutations. */
export function useCanvasGraph(
	workspaceId: string,
	initial: CanvasState,
	wrapperRef: React.RefObject<HTMLDivElement | null>,
): CanvasGraph {
	const rf = useReactFlow<PanelNode>();
	const initialNodes = useMemo(
		() => initial.panels.map(panelToNode),
		[initial.panels],
	);
	const [nodes, setNodes, onNodesChange] =
		useNodesState<PanelNode>(initialNodes);

	const nodesRef = useRef(nodes);
	nodesRef.current = nodes;
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
	// Suppress persistence while applying a programmatic reconcile.
	const suppress = useRef(false);
	// Panel ids deleted locally, guarded against reconcile resurrection.
	const recentlyDeleted = useRef(new Set<string>());

	useEffect(() => {
		const map = timers.current;
		return () => {
			for (const t of map.values()) clearTimeout(t);
			map.clear();
		};
	}, []);

	const persist = useCallback(
		(id: string) => {
			const existing = timers.current.get(id);
			if (existing) clearTimeout(existing);
			timers.current.set(
				id,
				setTimeout(() => {
					timers.current.delete(id);
					const node = nodesRef.current.find((n) => n.id === id);
					if (node) {
						void saveCanvasPanel(nodeToPanel(node, workspaceId)).catch(
							() => {},
						);
					}
				}, PERSIST_DEBOUNCE_MS),
			);
		},
		[workspaceId],
	);

	const tearDown = useCallback(
		(node: PanelNode) => {
			// Cancel any pending debounced persist so a stale upsert can't
			// re-insert the row after we delete it (write-after-delete race).
			const pending = timers.current.get(node.id);
			if (pending) {
				clearTimeout(pending);
				timers.current.delete(node.id);
			}
			if (node.data.panelType === "terminal") {
				const { instanceId } = parsePanelConfig(node.data.config);
				if (instanceId) closeTerminal(instanceId);
			}
			useConnectionsStore.getState().pruneForPanel(node.id);
			void deleteCanvasPanel(workspaceId, node.id).catch(() => {});
			// Guard reconcile against resurrecting this id from a stale snapshot.
			recentlyDeleted.current.add(node.id);
			setTimeout(() => recentlyDeleted.current.delete(node.id), 5000);
		},
		[workspaceId],
	);

	const handleNodesChange = useCallback(
		(changes: NodeChange<PanelNode>[]) => {
			onNodesChange(changes);
			if (suppress.current) return;
			for (const change of changes) {
				if (change.type === "position" && change.dragging === false) {
					persist(change.id);
				} else if (change.type === "dimensions" && change.resizing === false) {
					persist(change.id);
				} else if (change.type === "remove") {
					const node = nodesRef.current.find((n) => n.id === change.id);
					if (node) tearDown(node);
				}
			}
		},
		[onNodesChange, persist, tearDown],
	);

	const patchNodeData = useCallback(
		(id: string, patch: Partial<PanelNodeData>) => {
			setNodes((ns) =>
				ns.map((n) =>
					n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
				),
			);
			persist(id);
		},
		[setNodes, persist],
	);

	const removeNode = useCallback(
		(id: string) => {
			const node = nodesRef.current.find((n) => n.id === id);
			setNodes((ns) => ns.filter((n) => n.id !== id));
			if (node) tearDown(node);
		},
		[setNodes, tearDown],
	);

	const spawnPosition = useCallback(
		(override?: { x: number; y: number }) => {
			if (override) return override;
			const rect = wrapperRef.current?.getBoundingClientRect();
			if (rect) {
				return rf.screenToFlowPosition({
					x: rect.left + rect.width / 2 - PANEL_DEFAULT_WIDTH / 2,
					y: rect.top + rect.height / 2 - PANEL_DEFAULT_HEIGHT / 2,
				});
			}
			return { x: 0, y: 0 };
		},
		[rf, wrapperRef],
	);

	const addPanel = useCallback<CanvasActions["addPanel"]>(
		async (type, opts) => {
			const { config } = await buildConfig(type, workspaceId, opts?.config);
			const id = crypto.randomUUID();
			const position = spawnPosition(opts?.position);
			const node: PanelNode = {
				id,
				type: "panel",
				position,
				width: opts?.size?.width ?? PANEL_DEFAULT_WIDTH,
				height: opts?.size?.height ?? PANEL_DEFAULT_HEIGHT,
				dragHandle: DRAG_HANDLE,
				draggable: true,
				selected: true,
				data: { panelType: type, title: "", config, locked: false },
			};
			setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
			persist(id);
			return id;
		},
		[workspaceId, spawnPosition, setNodes, persist],
	);

	const duplicateNode = useCallback<CanvasActions["duplicateNode"]>(
		async (id) => {
			const src = nodesRef.current.find((n) => n.id === id);
			if (!src) return;
			const { config } = await buildConfig(
				src.data.panelType,
				workspaceId,
				// For non-live types, copy the source config verbatim.
				src.data.panelType === "conversation" ||
					src.data.panelType === "terminal"
					? undefined
					: parsePanelConfig(src.data.config),
			);
			const newId = crypto.randomUUID();
			const node: PanelNode = {
				...src,
				id: newId,
				selected: true,
				position: { x: src.position.x + 32, y: src.position.y + 32 },
				data: { ...src.data, config },
			};
			setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
			persist(newId);
		},
		[workspaceId, setNodes, persist],
	);

	const restack = useCallback(
		(id: string, toFront: boolean) => {
			setNodes((ns) => {
				const zs = ns.map((n) => n.zIndex ?? 0);
				const target = toFront
					? Math.max(0, ...zs) + 1
					: Math.min(0, ...zs) - 1;
				return ns.map((n) => (n.id === id ? { ...n, zIndex: target } : n));
			});
			persist(id);
		},
		[setNodes, persist],
	);

	const setLocked = useCallback(
		(id: string, locked: boolean) => {
			setNodes((ns) =>
				ns.map((n) =>
					n.id === id
						? { ...n, draggable: !locked, data: { ...n.data, locked } }
						: n,
				),
			);
			persist(id);
		},
		[setNodes, persist],
	);

	const reconcile = useCallback(
		(state: CanvasState) => {
			suppress.current = true;
			const byId = new Map(state.panels.map((p) => [p.id, p]));
			setNodes((ns) => {
				const liveIds = new Set(ns.map((n) => n.id));
				const updated = ns
					.filter((n) => byId.has(n.id))
					.map((n) => {
						const p = byId.get(n.id);
						if (!p) return n;
						return {
							...n,
							position: { x: p.x, y: p.y },
							width: p.width,
							height: p.height,
							zIndex: p.z,
							data: {
								panelType: p.panelType,
								title: p.title ?? "",
								config: p.config ?? "{}",
								locked: p.locked,
							},
						} satisfies PanelNode;
					});
				const added = state.panels
					.filter(
						(p) => !liveIds.has(p.id) && !recentlyDeleted.current.has(p.id),
					)
					.map(panelToNode);
				return [...updated, ...added];
			});
			useConnectionsStore.getState().hydrate(workspaceId, state.connections);
			setTimeout(() => {
				suppress.current = false;
			}, 0);
		},
		[setNodes, workspaceId],
	);

	const actions = useMemo<CanvasActions>(
		() => ({
			patchNodeData,
			removeNode,
			addPanel,
			duplicateNode,
			bringToFront: (id) => restack(id, true),
			sendToBack: (id) => restack(id, false),
			setLocked,
		}),
		[patchNodeData, removeNode, addPanel, duplicateNode, restack, setLocked],
	);

	return { nodes, onNodesChange: handleNodesChange, actions, reconcile };
}
