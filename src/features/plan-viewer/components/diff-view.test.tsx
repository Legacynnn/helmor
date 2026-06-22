import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("Diff", () => {
	const src = [
		'<Diff lang="ts">',
		"- const x = 1;",
		"+ const x = 2;",
		"  unchanged();",
		"</Diff>",
	].join("\n");

	it("renders the header label and the changed lines", () => {
		renderMdx(src);
		expect(screen.getByText("Diff · ts")).toBeInTheDocument();
		expect(screen.getByText(/const x = 1;/)).toBeInTheDocument();
		expect(screen.getByText(/const x = 2;/)).toBeInTheDocument();
		expect(screen.getByText(/unchanged\(\);/)).toBeInTheDocument();
	});
});
