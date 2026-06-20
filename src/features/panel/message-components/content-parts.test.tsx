import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanReviewPart, WorkflowPart } from "@/lib/api";
import { PlanReviewCard, WorkflowCard } from "./content-parts";

const mdxPlanningEnabled = { current: true };
vi.mock("@/lib/settings", () => ({
	useSettings: () => ({
		settings: { mdxPlanningEnabled: mdxPlanningEnabled.current },
	}),
}));

// LazyStreamdown is a Suspense-lazy markdown renderer; render its children as
// plain text so the full-plan path is assertable without the async chunk.
vi.mock("@/components/streamdown-loader", () => ({
	LazyStreamdown: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="streamdown">{children}</div>
	),
}));

afterEach(() => {
	mdxPlanningEnabled.current = true;
	cleanup();
});

function workflow(overrides: Partial<WorkflowPart> = {}): WorkflowPart {
	return {
		type: "workflow",
		id: "workflow:wf_1",
		name: "demo-two-agents",
		status: "completed",
		agents: [
			{ label: "agent-alpha", status: "done", resultPreview: "alpha" },
			{ label: "agent-beta", status: "done", resultPreview: "beta" },
		],
		totalTokens: 61609,
		durationMs: 1655,
		...overrides,
	};
}

describe("WorkflowCard", () => {
	it("renders the workflow name, agents, result previews, and footer", () => {
		render(<WorkflowCard part={workflow()} />);
		expect(screen.getByText("Workflow · demo-two-agents")).toBeInTheDocument();
		expect(screen.getByText("agent-alpha")).toBeInTheDocument();
		expect(screen.getByText("agent-beta")).toBeInTheDocument();
		expect(screen.getByText("— alpha")).toBeInTheDocument();
		// Footer: agent count · tokens · duration.
		expect(screen.getByText(/2 agents/)).toBeInTheDocument();
		expect(screen.getByText(/61\.6k tokens/)).toBeInTheDocument();
		expect(screen.getByText(/1\.7s/)).toBeInTheDocument();
	});

	it("shimmers the header only while running, never on a settled run", () => {
		const { container: runningC } = render(
			<WorkflowCard part={workflow({ status: "running" })} />,
		);
		expect(runningC.querySelector(".helmor-shimmer-text")).not.toBeNull();

		const { container: doneC } = render(<WorkflowCard part={workflow()} />);
		// A completed run is a static label — no looping shimmer animation.
		expect(doneC.querySelector(".helmor-shimmer-text")).toBeNull();
	});

	it("shows the status word for the run", () => {
		render(<WorkflowCard part={workflow({ status: "failed", agents: [] })} />);
		expect(screen.getByText("failed")).toBeInTheDocument();
	});

	it("renders mixed agent states (done + running) in a running workflow", () => {
		const { container } = render(
			<WorkflowCard
				part={workflow({
					status: "running",
					agents: [
						{ label: "agent-alpha", status: "done", resultPreview: "alpha" },
						{ label: "agent-beta", status: "running" },
					],
				})}
			/>,
		);
		expect(screen.getByText("agent-alpha")).toBeInTheDocument();
		expect(screen.getByText("agent-beta")).toBeInTheDocument();
		// The running agent has no result preview yet.
		expect(screen.queryByText(/— beta/)).toBeNull();
		// Two distinct status icons rendered (done check + running dot).
		expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(3);
	});

	it("omits missing footer fields without rendering 'undefined'", () => {
		render(<WorkflowCard part={workflow({ totalTokens: undefined })} />);
		// Footer shows agents + duration, but no token clause.
		expect(screen.getByText(/2 agents/)).toBeInTheDocument();
		expect(screen.queryByText(/tokens/)).toBeNull();
		expect(screen.queryByText(/undefined/)).toBeNull();
	});
});

function planReview(overrides: Partial<PlanReviewPart> = {}): PlanReviewPart {
	return {
		type: "plan-review",
		toolUseId: "tu_1",
		toolName: "ExitPlanMode",
		plan: "# Big plan\n\nDo the thing.",
		planFilePath: ".helmor/plans/big-plan.mdx",
		...overrides,
	};
}

describe("PlanReviewCard", () => {
	it("renders the compact card for an MDX plan with the setting on", () => {
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");
		render(<PlanReviewCard part={planReview()} />);

		expect(
			screen.getByText(/open the Plan tab to review/i),
		).toBeInTheDocument();
		// Full markdown is NOT dumped inline.
		expect(screen.queryByText(/Do the thing/)).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: /open plan/i }));
		const event = dispatchSpy.mock.calls.at(-1)?.[0] as CustomEvent;
		expect(event.type).toBe("helmor:open-plan");
		expect(event.detail).toEqual({ slug: "big-plan" });
		dispatchSpy.mockRestore();
	});

	it("renders the full plan markdown when the setting is off", () => {
		mdxPlanningEnabled.current = false;
		render(<PlanReviewCard part={planReview()} />);
		expect(screen.getByTestId("streamdown")).toHaveTextContent("Do the thing");
		expect(screen.queryByText(/open the Plan tab to review/i)).toBeNull();
	});

	it("renders the full plan markdown for a non-MDX plan path", () => {
		render(<PlanReviewCard part={planReview({ planFilePath: null })} />);
		expect(screen.getByTestId("streamdown")).toHaveTextContent("Do the thing");
		expect(screen.queryByText(/open the Plan tab to review/i)).toBeNull();
	});
});
