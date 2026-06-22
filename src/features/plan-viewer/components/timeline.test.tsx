import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("Timeline", () => {
	const src = [
		"<Timeline>",
		'<Phase title="Phase 1: Foundation" status="done">',
		"Shared shell.",
		"</Phase>",
		'<Phase title="Phase 2: Build" status="active">',
		"New components.",
		"</Phase>",
		"</Timeline>",
	].join("\n");

	it("renders the header and each phase title", () => {
		renderMdx(src);
		expect(screen.getByText("Timeline")).toBeInTheDocument();
		expect(screen.getByText("Phase 1: Foundation")).toBeInTheDocument();
		expect(screen.getByText("Phase 2: Build")).toBeInTheDocument();
	});
});
