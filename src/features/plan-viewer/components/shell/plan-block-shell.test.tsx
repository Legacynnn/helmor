import { render, screen } from "@testing-library/react";
import { HelpCircleIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { PlanBlockShell } from "./plan-block-shell";

describe("PlanBlockShell", () => {
	it("renders a header row with title and body when title is given", () => {
		render(
			<PlanBlockShell title="Open questions" icon={HelpCircleIcon}>
				<p>body text</p>
			</PlanBlockShell>,
		);
		expect(screen.getByText("Open questions")).toBeInTheDocument();
		expect(screen.getByText("body text")).toBeInTheDocument();
	});

	it("applies the accent container classes", () => {
		const { container } = render(
			<PlanBlockShell accent="highlight" title="X">
				<span>y</span>
			</PlanBlockShell>,
		);
		const section = container.querySelector("section");
		expect(section?.className).toContain("border-violet-500/40");
	});

	it("renders no header row when no icon/title/badge are provided", () => {
		const { container } = render(
			<PlanBlockShell>
				<span>only body</span>
			</PlanBlockShell>,
		);
		expect(container.querySelector(".border-b")).toBeNull();
		expect(screen.getByText("only body")).toBeInTheDocument();
	});

	it("renders a trailing badge in the header", () => {
		render(
			<PlanBlockShell title="File changes" badge={<span>3</span>}>
				<span>body</span>
			</PlanBlockShell>,
		);
		expect(screen.getByText("3")).toBeInTheDocument();
	});
});
