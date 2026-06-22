import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("BeforeAfter", () => {
	const src = [
		"<BeforeAfter>",
		"<Before>",
		"Old: one big canvas.",
		"</Before>",
		"<After>",
		"New: split canvas.",
		"</After>",
		"</BeforeAfter>",
	].join("\n");

	it("renders labeled Before and After panels", () => {
		renderMdx(src);
		expect(screen.getByText("Before")).toBeInTheDocument();
		expect(screen.getByText("After")).toBeInTheDocument();
		expect(screen.getByText("Old: one big canvas.")).toBeInTheDocument();
		expect(screen.getByText("New: split canvas.")).toBeInTheDocument();
	});

	it("renders only the side that has content", () => {
		renderMdx(
			[
				"<BeforeAfter>",
				"<After>",
				"Only after.",
				"</After>",
				"</BeforeAfter>",
			].join("\n"),
		);
		expect(screen.getByText("After")).toBeInTheDocument();
		expect(screen.getByText("Only after.")).toBeInTheDocument();
		expect(screen.queryByText("Before")).toBeNull();
	});
});
