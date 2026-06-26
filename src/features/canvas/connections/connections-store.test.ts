import { beforeEach, expect, it, vi } from "vitest";

// Mock the IPC writes so the store's write-through doesn't hit Tauri.
const apiMocks = vi.hoisted(() => ({
	saveCanvasConnection: vi.fn(async () => {}),
	deleteCanvasConnection: vi.fn(async () => {}),
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return {
		...actual,
		saveCanvasConnection: apiMocks.saveCanvasConnection,
		deleteCanvasConnection: apiMocks.deleteCanvasConnection,
	};
});

// randomUUID is deterministic-enough here; just ensure uniqueness per call.
let uuidCounter = 0;
vi.stubGlobal("crypto", {
	...globalThis.crypto,
	randomUUID: () => `id-${++uuidCounter}` as `${string}-${string}`,
});

const { useConnectionsStore, deriveKind, connectionMeta } = await import(
	"./connections-store"
);

beforeEach(() => {
	uuidCounter = 0;
	apiMocks.saveCanvasConnection.mockClear();
	apiMocks.deleteCanvasConnection.mockClear();
	useConnectionsStore.getState().hydrate("ws1", []);
});

it("derives edge kind from endpoint types", () => {
	expect(deriveKind("conversation", "terminal")).toBe("conversation-terminal");
	expect(deriveKind("conversation", "conversation")).toBe(
		"conversation-conversation",
	);
	expect(deriveKind("terminal", "conversation")).toBe("generic");
	expect(deriveKind("placeholder", "terminal")).toBe("generic");
});

it("completes a click-to-connect and persists the edge", () => {
	const store = useConnectionsStore.getState();
	store.startConnect("a", "conversation");
	store.completeConnect("b", "terminal");

	const conns = useConnectionsStore.getState().connections;
	expect(conns).toHaveLength(1);
	expect(conns[0]).toMatchObject({
		fromPanelId: "a",
		toPanelId: "b",
		kind: "conversation-terminal",
	});
	expect(apiMocks.saveCanvasConnection).toHaveBeenCalledOnce();
	expect(useConnectionsStore.getState().pendingSource).toBeNull();
});

it("ignores self-connection and duplicates", () => {
	const store = useConnectionsStore.getState();
	store.startConnect("a", "conversation");
	store.completeConnect("a", "conversation"); // self
	expect(useConnectionsStore.getState().connections).toHaveLength(0);

	store.startConnect("a", "conversation");
	store.completeConnect("b", "terminal");
	store.startConnect("a", "conversation");
	store.completeConnect("b", "terminal"); // duplicate
	expect(useConnectionsStore.getState().connections).toHaveLength(1);
});

it("setPrimaryTerminal makes the choice exclusive among a source's terminals", () => {
	const store = useConnectionsStore.getState();
	store.startConnect("conv", "conversation");
	store.completeConnect("t1", "terminal");
	store.startConnect("conv", "conversation");
	store.completeConnect("t2", "terminal");

	const [e1, e2] = useConnectionsStore.getState().connections;
	store.setPrimaryTerminal("conv", e2.id);

	const after = useConnectionsStore.getState().connections;
	expect(connectionMeta(after.find((c) => c.id === e1.id)!).primary).toBe(
		false,
	);
	expect(connectionMeta(after.find((c) => c.id === e2.id)!).primary).toBe(true);

	// Re-pick the first — exclusivity flips.
	store.setPrimaryTerminal("conv", e1.id);
	const after2 = useConnectionsStore.getState().connections;
	expect(connectionMeta(after2.find((c) => c.id === e1.id)!).primary).toBe(
		true,
	);
	expect(connectionMeta(after2.find((c) => c.id === e2.id)!).primary).toBe(
		false,
	);
});

it("disconnect removes the edge and calls the backend", () => {
	const store = useConnectionsStore.getState();
	store.startConnect("a", "conversation");
	store.completeConnect("b", "terminal");
	const id = useConnectionsStore.getState().connections[0].id;

	store.disconnect(id);
	expect(useConnectionsStore.getState().connections).toHaveLength(0);
	expect(apiMocks.deleteCanvasConnection).toHaveBeenCalledWith("ws1", id);
});

it("pruneForPanel drops every edge touching a deleted panel", () => {
	const store = useConnectionsStore.getState();
	store.startConnect("a", "conversation");
	store.completeConnect("b", "terminal");
	store.startConnect("b", "conversation");
	store.completeConnect("c", "terminal");
	expect(useConnectionsStore.getState().connections).toHaveLength(2);

	store.pruneForPanel("b");
	expect(useConnectionsStore.getState().connections).toHaveLength(0);
});
