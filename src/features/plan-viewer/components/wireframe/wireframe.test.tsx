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

	it("renders an image inside a row as a compact avatar tile, not a banner", () => {
		const { container } = renderMdx(
			[
				'<Wireframe label="Top bar" surface="app">',
				"row",
				"  heading Hercules",
				"  image avatar",
				"</Wireframe>",
			].join("\n"),
		);
		const avatar = container.querySelector('[title="avatar"]');
		expect(avatar).not.toBeNull();
		// Compact (size-9) + rounded-full, never the block banner height.
		expect(avatar?.className).toContain("size-9");
		expect(avatar?.className).toContain("rounded-full");
		expect(avatar?.className).not.toContain("h-20");
	});

	it("renders a block image (in a col) as a full-width banner", () => {
		const { container } = renderMdx(
			["<Wireframe>", "col", "  image Hero", "</Wireframe>"].join("\n"),
		);
		const banner = container.querySelector(".h-20");
		expect(banner).not.toBeNull();
	});

	it("renders grid/section/spacer/box layout primitives", () => {
		const { container } = renderMdx(
			[
				'<Wireframe label="Layout" surface="app">',
				"grid 3",
				"  box Panel",
				"    text Inside",
				"section Sidebar",
				"  text Nav",
				"row",
				"  heading Logo",
				"  spacer",
				"  button Action",
				"</Wireframe>",
			].join("\n"),
		);
		// A 3-column grid container.
		expect(container.querySelector(".grid-cols-3")).not.toBeNull();
		// The box label becomes a header bar (its own bordered row).
		expect(screen.getByText("Panel").className).toContain("border-b");
		// The section caption + the spacer's elastic gap exist.
		expect(screen.getByText("Sidebar")).toBeInTheDocument();
		expect(container.querySelector(".flex-1")).not.toBeNull();
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
