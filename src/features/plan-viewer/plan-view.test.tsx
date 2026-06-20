import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { PlanView } from "./plan-view";

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
			onApprove={() => {}}
			onHandoff={() => {}}
		/>,
	);
	expect(screen.getByText("High risk")).toBeInTheDocument();
	expect(screen.getByText(/Unsupported plan block/i)).toBeInTheDocument();
	expect(screen.getByRole("button", { name: /handoff/i })).toBeInTheDocument();
	expect(screen.getByText(/Plan ·/i)).toBeInTheDocument();
});
