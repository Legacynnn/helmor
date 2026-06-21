import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanSummary } from "@/lib/api";

const listPlansMock = vi.fn();
vi.mock("@/features/plan-viewer/use-plan", () => ({
	usePlanList: () => ({ data: listPlansMock() }),
}));

let mdxPlanningEnabled = true;
vi.mock("@/lib/settings", () => ({
	useSettings: () => ({ settings: { mdxPlanningEnabled } }),
}));

vi.mock("./file-link-context", () => ({
	useFileLinkContext: () => ({ sessionId: "s1" }),
}));

import { PlanUpdatedTrigger } from "./content-parts";

function summary(slug: string, title: string): PlanSummary {
	return { slug, title, status: "draft", path: `.helmor/plans/${slug}.mdx` };
}

afterEach(() => {
	listPlansMock.mockReset();
	mdxPlanningEnabled = true;
});

describe("PlanUpdatedTrigger", () => {
	it("renders the plan title and dispatches open-plan on click", () => {
		listPlansMock.mockReturnValue([summary("foo", "Foo plan")]);
		const events: CustomEvent[] = [];
		const handler = (e: Event) => events.push(e as CustomEvent);
		window.addEventListener("helmor:open-plan", handler);

		render(<PlanUpdatedTrigger planFilePath=".helmor/plans/foo.mdx" />);

		expect(screen.getByText("Plan updated — Foo plan")).toBeInTheDocument();
		screen.getByRole("button", { name: "Open" }).click();
		expect(events).toHaveLength(1);
		expect(events[0].detail).toEqual({ slug: "foo", sessionId: "s1" });

		window.removeEventListener("helmor:open-plan", handler);
	});

	it("renders nothing when MDX planning is disabled", () => {
		mdxPlanningEnabled = false;
		listPlansMock.mockReturnValue([summary("foo", "Foo plan")]);
		const { container } = render(
			<PlanUpdatedTrigger planFilePath=".helmor/plans/foo.mdx" />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders nothing for a non-plan file path", () => {
		listPlansMock.mockReturnValue([]);
		const { container } = render(
			<PlanUpdatedTrigger planFilePath="src/x.ts" />,
		);
		expect(container.firstChild).toBeNull();
	});
});
