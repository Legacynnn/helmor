import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("DataModel", () => {
	const src = [
		"<DataModel>",
		'<Entity name="User">',
		"id: string",
		"email: string",
		"</Entity>",
		'<Entity name="Post">',
		"title: string",
		"authorId: string",
		"</Entity>",
		"</DataModel>",
	].join("\n");

	it("renders each entity name and its fields", () => {
		renderMdx(src);
		expect(screen.getByText("Data model")).toBeInTheDocument();
		expect(screen.getByText("User")).toBeInTheDocument();
		expect(screen.getByText("Post")).toBeInTheDocument();
		expect(screen.getByText("email")).toBeInTheDocument();
		expect(screen.getByText("title")).toBeInTheDocument();
		expect(screen.getByText("authorId")).toBeInTheDocument();
	});

	it("renders nothing when there are no Entity children", () => {
		const { container } = renderMdx(["<DataModel>", "</DataModel>"].join("\n"));
		expect(container.querySelector("section")).toBeNull();
	});
});
