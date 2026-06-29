import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CanvasPanel } from "@/lib/api";
import { CanvasPreview } from "./canvas-preview";

function panel(over: Partial<CanvasPanel>): CanvasPanel {
	return {
		id: "p",
		workspaceId: "w",
		panelType: "conversation",
		x: 0,
		y: 0,
		width: 100,
		height: 80,
		z: 0,
		locked: false,
		createdAt: "",
		updatedAt: "",
		...over,
	};
}

describe("CanvasPreview", () => {
	afterEach(cleanup);

	it("shows an empty state when there are no panels", () => {
		const { getByText } = render(<CanvasPreview panels={[]} />);
		expect(getByText(/empty canvas/i)).toBeInTheDocument();
	});

	it("renders one scaled rect per panel", () => {
		const { container } = render(
			<CanvasPreview
				panels={[
					panel({ id: "a", x: 0, y: 0 }),
					panel({ id: "b", x: 400, y: 300, panelType: "terminal" }),
				]}
			/>,
		);
		// outer box + 2 panel rects
		expect(container.querySelectorAll("div").length).toBeGreaterThanOrEqual(3);
	});
});
