import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

// Mock React Flow primitives so the frame renders without a real canvas.
vi.mock("@xyflow/react", () => ({
	Handle: () => null,
	Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
}));

import type { FrameData } from "../build-graph";
import { PreviewFrame } from "./preview-frame";

const data: FrameData = {
	title: "Home",
	frameKind: "preview",
	device: "browser",
	theme: "repo",
	accent: "neutral",
	previewCode: "function App() { return null }",
	wireframeSource: "",
	bodyBlocks: [],
};

function renderFrame() {
	const props = { data } as unknown as ComponentProps<typeof PreviewFrame>;
	return render(<PreviewFrame {...props} />);
}

describe("PreviewFrame", () => {
	it("mounts the live preview iframe immediately (no run-to-preview gate)", () => {
		renderFrame();
		const iframe = document.querySelector("iframe");
		expect(iframe).not.toBeNull();
		expect(iframe?.getAttribute("title")).toBe("Live UI preview");
	});
});
