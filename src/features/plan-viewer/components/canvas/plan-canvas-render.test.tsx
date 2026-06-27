import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parsePlanMdx } from "../../mdx/parse";
import PlanCanvasSurface from "./plan-canvas-surface";

// Renders the REAL surface against real @xyflow/react (jsdom polyfills
// ResizeObserver/matchMedia in src/test/setup.ts) to catch runtime regressions
// the heavily-mocked plan-canvas.test.tsx can't see (floating edges via
// useInternalNode, MiniMap props, etc.).
const SRC = [
	"---",
	'title: "T"',
	"status: draft",
	'summary: "S"',
	"---",
	"",
	'<PlanCanvas theme="repo" height="640">',
	'<CanvasGroup id="auth" title="Onboarding" contains="login,verify" accent="info" />',
	'<CanvasNode id="login" title="Sign in" x="40" y="80" device="mobile" accent="info">',
	"<Wireframe>",
	"section",
	"  heading Welcome",
	"  button Continue",
	"</Wireframe>",
	"</CanvasNode>",
	'<CanvasNode id="verify" title="Verify" x="520" y="80" device="mobile" accent="info" />',
	'<CanvasNode id="note" title="NOTE" x="520" y="600" accent="warning">',
	"A pinned note.",
	"</CanvasNode>",
	'<CanvasFlow from="login" to="verify" label="Submit" kind="primary" />',
	'<CanvasFlow from="verify" to="login" label="Back" kind="back" />',
	"</PlanCanvas>",
	"",
].join("\n");

function canvasChildBlocks() {
	const { blocks } = parsePlanMdx(SRC);
	const canvas = blocks.find(
		(b) => b.kind === "component" && b.name === "PlanCanvas",
	);
	if (canvas?.kind !== "component") throw new Error("no PlanCanvas parsed");
	return canvas.childBlocks;
}

describe("PlanCanvasSurface (real xyflow render)", () => {
	it("mounts the React Flow surface without throwing", () => {
		const { container } = render(
			<PlanCanvasSurface childBlocks={canvasChildBlocks()} theme="repo" />,
		);
		expect(container.querySelector(".react-flow")).not.toBeNull();
	});

	it("renders the MiniMap", () => {
		const { container } = render(
			<PlanCanvasSurface childBlocks={canvasChildBlocks()} theme="repo" />,
		);
		expect(container.querySelector(".react-flow__minimap")).not.toBeNull();
	});
});
