import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileMap } from "./file-map";
import { OpenQuestions } from "./open-questions";
import { UnsupportedBlock } from "./placeholder";
import { RiskCard } from "./risk-card";
import { Steps } from "./steps";

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

describe("OpenQuestions", () => {
	it("renders the header and its children", () => {
		render(
			<OpenQuestions>
				<p>What database should we use?</p>
			</OpenQuestions>,
		);
		expect(screen.getByText("Open questions")).toBeInTheDocument();
		expect(
			screen.getByText("What database should we use?"),
		).toBeInTheDocument();
	});
});

describe("Steps", () => {
	it("renders a Steps header and forwards children", () => {
		render(
			<Steps>
				<ol>
					<li>First do this</li>
				</ol>
			</Steps>,
		);
		expect(screen.getByText("Steps")).toBeInTheDocument();
		expect(screen.getByText("First do this")).toBeInTheDocument();
	});
});

describe("FileMap", () => {
	it("renders a header, count badge, and parsed entries", () => {
		render(<FileMap>{"create src/a.ts\nmodify src/b.ts"}</FileMap>);
		expect(screen.getByText("File changes")).toBeInTheDocument();
		expect(screen.getByText("2")).toBeInTheDocument();
		expect(screen.getByText("src/a.ts")).toBeInTheDocument();
		expect(screen.getByText("src/b.ts")).toBeInTheDocument();
	});

	it("renders nothing when there are no valid entries", () => {
		const { container } = render(<FileMap>{"not a real line"}</FileMap>);
		expect(container.querySelector("section")).toBeNull();
	});
});
