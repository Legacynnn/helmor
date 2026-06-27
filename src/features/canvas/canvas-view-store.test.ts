import { beforeEach, expect, it, vi } from "vitest";

// Mock the IPC write so the store's debounced save doesn't hit Tauri.
const apiMocks = vi.hoisted(() => ({
	saveCanvasViewState: vi.fn(async () => {}),
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return { ...actual, saveCanvasViewState: apiMocks.saveCanvasViewState };
});

const { useCanvasViewStore } = await import("./canvas-view-store");

beforeEach(() => {
	apiMocks.saveCanvasViewState.mockClear();
	useCanvasViewStore.getState().hydrate({
		workspaceId: "ws1",
		panX: 0,
		panY: 0,
		zoom: 1,
		translucency: 1,
		backgroundPattern: "dots",
		backgroundColor: null,
		backgroundTheme: "system",
		snapToGrid: false,
		backgroundImage: null,
		updatedAt: "",
	});
});

it("setAppearance updates backgroundImage and schedules a save", async () => {
	vi.useFakeTimers();
	useCanvasViewStore.getState().setAppearance({ backgroundImage: "aurora" });
	expect(useCanvasViewStore.getState().backgroundImage).toBe("aurora");
	await vi.advanceTimersByTimeAsync(600);
	expect(apiMocks.saveCanvasViewState).toHaveBeenCalledWith(
		expect.objectContaining({ backgroundImage: "aurora" }),
	);
	vi.useRealTimers();
});
