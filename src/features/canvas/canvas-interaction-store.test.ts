import { beforeEach, expect, it } from "vitest";
import { useCanvasInteractionStore } from "./canvas-interaction-store";

beforeEach(() => useCanvasInteractionStore.getState().setSelectMode(false));

it("toggles select mode", () => {
	expect(useCanvasInteractionStore.getState().selectMode).toBe(false);
	useCanvasInteractionStore.getState().toggleSelect();
	expect(useCanvasInteractionStore.getState().selectMode).toBe(true);
});
it("setSelectMode sets explicitly", () => {
	useCanvasInteractionStore.getState().setSelectMode(true);
	expect(useCanvasInteractionStore.getState().selectMode).toBe(true);
});
