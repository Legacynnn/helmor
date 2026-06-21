import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanSummary, ThreadMessageLike } from "@/lib/api";

const listPlansMock = vi.fn();
vi.mock("@/features/plan-viewer/use-plan", () => ({
	usePlanList: () => ({ data: listPlansMock() }),
}));

let mdxPlanningEnabled = true;
vi.mock("@/lib/settings", () => ({
	useSettings: () => ({ settings: { mdxPlanningEnabled } }),
}));

import { PlanLinkStrip } from "./plan-link-strip";

function summary(slug: string, title: string): PlanSummary {
	return { slug, title, status: "draft", path: `.helmor/plans/${slug}.mdx` };
}
function planMsg(path: string): ThreadMessageLike {
	return {
		role: "assistant",
		content: [{ type: "plan-review", planFilePath: path } as never],
	};
}

afterEach(() => {
	listPlansMock.mockReset();
	mdxPlanningEnabled = true;
});

describe("PlanLinkStrip", () => {
	it("renders the latest plan's title and dispatches open-plan on click", () => {
		listPlansMock.mockReturnValue([
			summary("alpha", "Alpha plan"),
			summary("beta", "Beta plan"),
		]);
		const events: CustomEvent[] = [];
		const handler = (e: Event) => events.push(e as CustomEvent);
		window.addEventListener("helmor:open-plan", handler);

		render(
			<PlanLinkStrip
				sessionId="s1"
				messages={[planMsg(".helmor/plans/beta.mdx")]}
			/>,
		);

		expect(screen.getByText("Beta plan")).toBeInTheDocument();
		expect(screen.getByText("· 2 plans")).toBeInTheDocument();
		screen.getByRole("button", { name: "Open" }).click();
		expect(events).toHaveLength(1);
		expect(events[0].detail).toEqual({ slug: "beta", sessionId: "s1" });

		window.removeEventListener("helmor:open-plan", handler);
	});

	it("renders nothing when the session has no plans", () => {
		listPlansMock.mockReturnValue([]);
		const { container } = render(
			<PlanLinkStrip sessionId="s1" messages={[]} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("falls back to the first plan when no plan-review is in the messages", () => {
		listPlansMock.mockReturnValue([summary("alpha", "Alpha plan")]);
		render(<PlanLinkStrip sessionId="s1" messages={[]} />);
		expect(screen.getByText("Alpha plan")).toBeInTheDocument();
	});

	it("renders nothing when MDX planning is disabled, even with plans", () => {
		mdxPlanningEnabled = false;
		listPlansMock.mockReturnValue([summary("alpha", "Alpha plan")]);
		const { container } = render(
			<PlanLinkStrip sessionId="s1" messages={[]} />,
		);
		expect(container.firstChild).toBeNull();
	});
});
