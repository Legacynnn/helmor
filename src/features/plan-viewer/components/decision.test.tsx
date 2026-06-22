import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("Decision", () => {
	const src = [
		"<Decision>",
		'<Option title="Use Postgres" recommended>',
		"Mature and relational.",
		"</Option>",
		'<Option title="Use SQLite">',
		"Simplest to embed.",
		"</Option>",
		"</Decision>",
	].join("\n");

	it("renders each option title and flags the recommended one", () => {
		renderMdx(src);
		expect(screen.getByText("Decision")).toBeInTheDocument();
		expect(screen.getByText("Use Postgres")).toBeInTheDocument();
		expect(screen.getByText("Use SQLite")).toBeInTheDocument();
		expect(screen.getByText("Recommended")).toBeInTheDocument();
	});

	it("renders nothing when there are no Option children", () => {
		const { container } = renderMdx(["<Decision>", "</Decision>"].join("\n"));
		expect(container.querySelector("section")).toBeNull();
	});
});
