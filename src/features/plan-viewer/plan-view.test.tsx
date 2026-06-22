import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { BlockComment } from "./feedback";
import { PlanView } from "./plan-view";

afterEach(cleanup);

const MDX = `---
title: "Demo"
status: draft
---

Hello.

<RiskCard severity="high">
danger
</RiskCard>

<Mystery />`;

test("renders known blocks and a placeholder for unknown ones", () => {
	render(
		<PlanView
			content={MDX}
			status="draft"
			onRequestChanges={() => {}}
			onHandoff={() => {}}
		/>,
	);
	expect(screen.getByText("High risk")).toBeInTheDocument();
	expect(screen.getByText(/Unsupported plan block/i)).toBeInTheDocument();
	expect(screen.getByRole("button", { name: /handoff/i })).toBeInTheDocument();
	// The header shows the plan's frontmatter title alongside its status.
	expect(screen.getByText("Demo")).toBeInTheDocument();
	expect(screen.getByText("draft")).toBeInTheDocument();
});

test("renders a nested blocks-mode component recursively", () => {
	const nested = `<RiskCard severity="high">
Outer reason.

<RiskCard severity="low">Inner reason.</RiskCard>
</RiskCard>`;
	render(
		<PlanView
			content={nested}
			status="draft"
			onRequestChanges={() => {}}
			onHandoff={() => {}}
		/>,
	);
	// Both the outer (high) and the nested (low) RiskCard render.
	expect(screen.getByText("High risk")).toBeInTheDocument();
	expect(screen.getByText("Low risk")).toBeInTheDocument();
	expect(screen.getByText(/Outer reason\./)).toBeInTheDocument();
	expect(screen.getByText(/Inner reason\./)).toBeInTheDocument();
});

test("renders raw-mode components (Diagram + AnnotatedCode)", () => {
	const raw = `<Diagram>
graph TD; A-->B;
</Diagram>

<AnnotatedCode lang="ts" note="A note.">
const x = 1;
</AnnotatedCode>`;
	render(
		<PlanView
			content={raw}
			status="draft"
			onRequestChanges={() => {}}
			onHandoff={() => {}}
		/>,
	);
	expect(screen.getByText(/A note\./)).toBeInTheDocument();
	// The code body survives as raw text (syntax highlighting may split it
	// across spans, so match against the rendered text content).
	expect(document.body.textContent).toContain("const x = 1;");
});

test("request-changes is disabled until a comment is entered, then emits BlockComment[]", () => {
	const onRequestChanges = vi.fn<(comments: BlockComment[]) => void>();
	render(
		<PlanView
			content={MDX}
			status="draft"
			onRequestChanges={onRequestChanges}
			onHandoff={() => {}}
		/>,
	);

	const requestButton = screen.getByRole("button", {
		name: /request changes/i,
	});
	expect(requestButton).toBeDisabled();

	// Open the comment input on the RiskCard block.
	const commentButton = screen.getByRole("button", {
		name: /comment on RiskCard/i,
	});
	fireEvent.click(commentButton);

	const input = screen.getByPlaceholderText(/Comment on/i);
	fireEvent.change(input, { target: { value: "Lower the severity." } });

	expect(requestButton).not.toBeDisabled();
	fireEvent.click(requestButton);

	expect(onRequestChanges).toHaveBeenCalledTimes(1);
	const comments = onRequestChanges.mock.calls[0][0];
	expect(comments).toEqual([
		{ blockId: "b1", blockName: "RiskCard", comment: "Lower the severity." },
	]);
});
