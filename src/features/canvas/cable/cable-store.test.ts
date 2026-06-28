import { beforeEach, describe, expect, it } from "vitest";
import { useCableStore } from "./cable-store";

describe("cable-store", () => {
	beforeEach(() => useCableStore.getState().cancel());

	it("spawns an active cable anchored to the source pane", () => {
		useCableStore.getState().spawn("pane-a", { x: 10, y: 20 });
		const active = useCableStore.getState().active;
		expect(active?.sourcePaneId).toBe("pane-a");
		expect(active?.anchor).toEqual({ x: 10, y: 20 });
		// Spawns in following mode so the plug tracks the cursor immediately.
		expect(active?.dragging).toBe(true);
		expect(active?.pluggedTargetId).toBeNull();
	});

	it("updates the plug position and hovered target while dragging", () => {
		useCableStore.getState().spawn("pane-a", { x: 0, y: 0 });
		useCableStore.getState().setDragging(true);
		useCableStore.getState().updatePlug({ x: 50, y: 60 }, "pane-b");
		const active = useCableStore.getState().active;
		expect(active?.plug).toEqual({ x: 50, y: 60 });
		expect(active?.hoveredTargetId).toBe("pane-b");
		expect(active?.dragging).toBe(true);
	});

	it("records the plugged target (decorative) on plugInto", () => {
		useCableStore.getState().spawn("pane-a", { x: 0, y: 0 });
		useCableStore.getState().plugInto("pane-b", { x: 90, y: 90 });
		const active = useCableStore.getState().active;
		expect(active?.pluggedTargetId).toBe("pane-b");
		expect(active?.plug).toEqual({ x: 90, y: 90 });
		expect(active?.dragging).toBe(false);
		expect(active?.hoveredTargetId).toBeNull();
	});

	it("cancel clears the active cable", () => {
		useCableStore.getState().spawn("pane-a", { x: 0, y: 0 });
		useCableStore.getState().cancel();
		expect(useCableStore.getState().active).toBeNull();
	});

	it("mutations are no-ops when no cable is active", () => {
		useCableStore.getState().updatePlug({ x: 1, y: 1 }, "pane-b");
		expect(useCableStore.getState().active).toBeNull();
	});
});
