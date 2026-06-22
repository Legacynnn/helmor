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

	it("renders the richer primitives inside a chosen surface", () => {
		renderMdx(
			[
				'<Wireframe label="Settings" surface="panel">',
				"heading Preferences",
				"field Email",
				"pill Beta",
				"button Save",
				"</Wireframe>",
			].join("\n"),
		);
		expect(screen.getByText("Preferences")).toBeInTheDocument();
		expect(screen.getByText("Email")).toBeInTheDocument();
		expect(screen.getByText("Beta")).toBeInTheDocument();
		// Primary button — themed via tokens, not white-on-white.
		const save = screen.getByText("Save");
		expect(save.className).toContain("bg-primary");
		expect(save.className).toContain("text-primary-foreground");
	});
});
