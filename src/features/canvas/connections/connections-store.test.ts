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

it("addConnection persists an edge with the derived kind", () => {
	useConnectionsStore
		.getState()
		.addConnection("a", "b", "conversation", "terminal");
	const conns = useConnectionsStore.getState().connections;
	expect(conns).toHaveLength(1);
	expect(conns[0]).toMatchObject({
		fromPanelId: "a",
		toPanelId: "b",
		kind: "conversation-terminal",
	});
	expect(apiMocks.saveCanvasConnection).toHaveBeenCalledOnce();
});

it("ignores self-connection and duplicates", () => {
	const store = useConnectionsStore.getState();
	store.addConnection("a", "a", "conversation", "conversation"); // self
	expect(useConnectionsStore.getState().connections).toHaveLength(0);

	store.addConnection("a", "b", "conversation", "terminal");
	store.addConnection("a", "b", "conversation", "terminal"); // duplicate
	expect(useConnectionsStore.getState().connections).toHaveLength(1);
});

it("setPrimaryTerminal makes the choice exclusive among a source's terminals", () => {
	const store = useConnectionsStore.getState();
	store.addConnection("conv", "t1", "conversation", "terminal");
	store.addConnection("conv", "t2", "conversation", "terminal");

	const [e1, e2] = useConnectionsStore.getState().connections;
	store.setPrimaryTerminal("conv", e2.id);

	const after = useConnectionsStore.getState().connections;
	expect(connectionMeta(after.find((c) => c.id === e1.id)!).primary).toBe(
		false,
	);
	expect(connectionMeta(after.find((c) => c.id === e2.id)!).primary).toBe(true);

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
	store.addConnection("a", "b", "conversation", "terminal");
	const id = useConnectionsStore.getState().connections[0].id;

	store.disconnect(id);
	expect(useConnectionsStore.getState().connections).toHaveLength(0);
	expect(apiMocks.deleteCanvasConnection).toHaveBeenCalledWith("ws1", id);
});

it("pruneForPanel drops every edge touching a deleted panel", () => {
	const store = useConnectionsStore.getState();
	store.addConnection("a", "b", "conversation", "terminal");
	store.addConnection("b", "c", "conversation", "terminal");
	expect(useConnectionsStore.getState().connections).toHaveLength(2);

	store.pruneForPanel("b");
	expect(useConnectionsStore.getState().connections).toHaveLength(0);
});
