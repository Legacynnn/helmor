import { beforeEach, expect, it, vi } from "vitest";

// Mock the IPC writes so the store's debounced saves don't hit Tauri.
const apiMocks = vi.hoisted(() => ({
	saveCanvasViewState: vi.fn(async () => {}),
	saveCanvasRepositoryStyle: vi.fn(async () => {}),
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return {
		...actual,
		saveCanvasViewState: apiMocks.saveCanvasViewState,
		saveCanvasRepositoryStyle: apiMocks.saveCanvasRepositoryStyle,
	};
});

const { useCanvasViewStore } = await import("./canvas-view-store");

beforeEach(() => {
	apiMocks.saveCanvasViewState.mockClear();
	apiMocks.saveCanvasRepositoryStyle.mockClear();
	useCanvasViewStore.getState().hydrateCamera({
		workspaceId: "ws1",
		panX: 0,
		panY: 0,
		zoom: 1,
		updatedAt: "",
	});
	useCanvasViewStore.getState().hydrateAppearance("repo1", {
		repositoryId: "repo1",
		translucency: 1,
		backgroundPattern: "dots",
		backgroundColor: null,
		backgroundTheme: "system",
		snapToGrid: false,
		backgroundImage: null,
		updatedAt: "",
	});
});

it("setAppearance updates backgroundImage and schedules a per-repo style save", async () => {
	vi.useFakeTimers();
	useCanvasViewStore.getState().setAppearance({ backgroundImage: "aurora" });
	expect(useCanvasViewStore.getState().backgroundImage).toBe("aurora");
	await vi.advanceTimersByTimeAsync(600);
	expect(apiMocks.saveCanvasRepositoryStyle).toHaveBeenCalledWith(
		expect.objectContaining({
			repositoryId: "repo1",
			backgroundImage: "aurora",
		}),
	);
	// Appearance edits must NOT write the per-workspace camera row.
	expect(apiMocks.saveCanvasViewState).not.toHaveBeenCalled();
	vi.useRealTimers();
});

it("setCamera schedules a per-workspace view save, not a style save", async () => {
	vi.useFakeTimers();
	useCanvasViewStore.getState().setCamera(120, 40, 2);
	await vi.advanceTimersByTimeAsync(600);
	expect(apiMocks.saveCanvasViewState).toHaveBeenCalledWith(
		expect.objectContaining({ workspaceId: "ws1", panX: 120, zoom: 2 }),
	);
	expect(apiMocks.saveCanvasRepositoryStyle).not.toHaveBeenCalled();
	vi.useRealTimers();
});

it("appearance edits with no linked repo stay in-memory (no save)", async () => {
	vi.useFakeTimers();
	// Simulate a workspace with no repository: appearance is hydrated with a
	// null repo id via a fresh hydrateAppearance is not possible, so clear it.
	useCanvasViewStore.setState({ repositoryId: null });
	useCanvasViewStore.getState().setAppearance({ translucency: 0.5 });
	expect(useCanvasViewStore.getState().translucency).toBe(0.5);
	await vi.advanceTimersByTimeAsync(600);
	expect(apiMocks.saveCanvasRepositoryStyle).not.toHaveBeenCalled();
	vi.useRealTimers();
});
