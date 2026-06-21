import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanErrorBoundary } from "./plan-error-boundary";

function Boom(): never {
	throw new Error("kaboom");
}

describe("PlanErrorBoundary", () => {
	beforeEach(() => {
		// React logs caught errors to console.error; silence for clean output.
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders children when they don't throw", () => {
		render(
			<PlanErrorBoundary>
				<div>plan body</div>
			</PlanErrorBoundary>,
		);
		expect(screen.getByText("plan body")).toBeInTheDocument();
	});

	it("renders a fallback (not blank) when a child throws", () => {
		render(
			<PlanErrorBoundary>
				<Boom />
			</PlanErrorBoundary>,
		);
		expect(
			screen.getByText("This plan couldn't be displayed."),
		).toBeInTheDocument();
		expect(screen.getByText("kaboom")).toBeInTheDocument();
	});

	it("calls onExit from the Back button", () => {
		const onExit = vi.fn();
		render(
			<PlanErrorBoundary onExit={onExit}>
				<Boom />
			</PlanErrorBoundary>,
		);
		screen.getByRole("button", { name: "Back to conversation" }).click();
		expect(onExit).toHaveBeenCalledTimes(1);
	});
});
