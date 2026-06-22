import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TaskPriorityIcon } from "./task-priority-icon";
import { TaskStatusIcon } from "./task-status-icon";

afterEach(() => cleanup());

describe("TaskStatusIcon", () => {
	it("renders an accessible label per status kind", () => {
		render(<TaskStatusIcon kind="started" title="In Progress" />);
		expect(
			screen.getByRole("img", { name: "In Progress" }),
		).toBeInTheDocument();
	});

	it("falls back to the kind when no title is given", () => {
		render(<TaskStatusIcon kind="completed" />);
		expect(
			screen.getByRole("img", { name: "Status: completed" }),
		).toBeInTheDocument();
	});

	it("tints with the provided state color", () => {
		const { container } = render(
			<TaskStatusIcon kind="unstarted" color="#ff0000" />,
		);
		const circle = container.querySelector("circle");
		expect(circle?.getAttribute("stroke")).toBe("#ff0000");
	});
});

describe("TaskPriorityIcon", () => {
	it("renders the urgent glyph distinctly", () => {
		const { container } = render(<TaskPriorityIcon priority="urgent" />);
		// Urgent is the only variant with a filled rounded square background.
		expect(container.querySelector('rect[fill="#fc7840"]')).not.toBeNull();
	});

	it("labels each priority", () => {
		render(<TaskPriorityIcon priority="high" />);
		expect(
			screen.getByRole("img", { name: "Priority: high" }),
		).toBeInTheDocument();
	});
});
