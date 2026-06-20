import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UnsupportedBlock } from "./placeholder";
import { RiskCard } from "./risk-card";

describe("RiskCard", () => {
	it("shows the high severity label", () => {
		render(<RiskCard severity="high">Be careful here.</RiskCard>);
		expect(screen.getByText("High risk")).toBeInTheDocument();
	});

	it("defaults to medium severity for unknown values", () => {
		render(<RiskCard severity="bogus">x</RiskCard>);
		expect(screen.getByText("Medium risk")).toBeInTheDocument();
	});
});

describe("UnsupportedBlock", () => {
	it("renders the unsupported component name", () => {
		render(<UnsupportedBlock name="Wireframe" />);
		expect(screen.getByText("Wireframe")).toBeInTheDocument();
		expect(screen.getByText(/Unsupported plan block/i)).toBeInTheDocument();
	});
});
