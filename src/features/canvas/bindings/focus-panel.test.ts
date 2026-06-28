import type { useReactFlow } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import { focusPanel } from "./focus-panel";

function makeRf(node: unknown) {
	const setCenter = vi.fn();
	let updated: { id: string; selected: boolean }[] = [];
	const rf = {
		getNode: (id: string) =>
			node && (node as { id: string }).id === id ? node : undefined,
		setNodes: (
			fn: (ns: { id: string; selected: boolean }[]) => typeof updated,
		) => {
			updated = fn([
				{ id: "a", selected: false },
				{ id: "b", selected: true },
			]);
		},
		getViewport: () => ({ x: 0, y: 0, zoom: 3 }),
		setCenter,
	} as unknown as ReturnType<typeof useReactFlow>;
	return { rf, setCenter, getUpdated: () => updated };
}

describe("focusPanel", () => {
	it("selects only the target and centers on it with clamped zoom", () => {
		const { rf, setCenter, getUpdated } = makeRf({
			id: "a",
			position: { x: 0, y: 0 },
			measured: { width: 100, height: 50 },
		});
		focusPanel(rf, "a");
		expect(getUpdated()).toEqual([
			{ id: "a", selected: true },
			{ id: "b", selected: false },
		]);
		expect(setCenter).toHaveBeenCalledWith(50, 25, {
			zoom: 1.5,
			duration: 350,
		});
	});

	it("no-ops for an unknown id", () => {
		const { rf, setCenter } = makeRf({ id: "a", position: { x: 0, y: 0 } });
		expect(() => focusPanel(rf, "missing")).not.toThrow();
		expect(setCenter).not.toHaveBeenCalled();
	});
});
