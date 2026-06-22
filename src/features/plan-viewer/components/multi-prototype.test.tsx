import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("MultiPrototype", () => {
	const src = [
		"<MultiPrototype>",
		'<Variant label="Compact" recommended>',
		"Compact layout body.",
		"</Variant>",
		'<Variant label="Spacious">',
		"Spacious layout body.",
		"</Variant>",
		"</MultiPrototype>",
	].join("\n");

	it("shows variant tabs and the first variant body initially", () => {
		renderMdx(src);
		expect(screen.getByRole("button", { name: /Compact/ })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Spacious/ }),
		).toBeInTheDocument();
		expect(screen.getByText("Compact layout body.")).toBeInTheDocument();
		expect(screen.queryByText("Spacious layout body.")).toBeNull();
	});

	it("switches body when another variant tab is clicked", () => {
		renderMdx(src);
		fireEvent.click(screen.getByRole("button", { name: /Spacious/ }));
		expect(screen.getByText("Spacious layout body.")).toBeInTheDocument();
		expect(screen.queryByText("Compact layout body.")).toBeNull();
	});

	it("renders nothing when there are no Variant children", () => {
		const { container } = renderMdx(
			["<MultiPrototype>", "</MultiPrototype>"].join("\n"),
		);
		expect(container.querySelector("section")).toBeNull();
	});
});
