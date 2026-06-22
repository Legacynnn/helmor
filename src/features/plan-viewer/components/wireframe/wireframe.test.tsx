import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../../mdx/parse";
import { renderBlocks } from "../../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("Wireframe", () => {
	const src = [
		'<Wireframe label="Login">',
		"col",
		"  text Welcome back",
		"  input Email",
		"  button Sign in",
		"</Wireframe>",
	].join("\n");

	it("renders the label header and the mockup elements", () => {
		renderMdx(src);
		expect(screen.getByText("Login")).toBeInTheDocument();
		expect(screen.getByText("Welcome back")).toBeInTheDocument();
		expect(screen.getByText("Email")).toBeInTheDocument();
		expect(screen.getByText("Sign in")).toBeInTheDocument();
	});

	it("renders nothing when the body is empty", () => {
		const { container } = renderMdx(["<Wireframe>", "</Wireframe>"].join("\n"));
		expect(container.querySelector("section")).toBeNull();
	});
});
