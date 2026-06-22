import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnnotatedCode } from "./annotated-code";
import { FileMap } from "./file-map";
import { OpenQuestions } from "./open-questions";
import { UnsupportedBlock } from "./placeholder";
import { RiskCard } from "./risk-card";
import { Steps } from "./steps";

// These tests render multiple components that share header labels (e.g. two
// AnnotatedCode blocks both render a "Code" header). Without auto-cleanup
// (globals are not enabled in this project's vitest config) renders accumulate
// in document.body and getByText finds duplicates — so unmount between tests.
afterEach(cleanup);

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
	it("renders a Steps header and the parsed steps", () => {
		render(<Steps>{"1. First do this\n2. Then that"}</Steps>);
		expect(screen.getByText("Steps")).toBeInTheDocument();
		expect(screen.getByText(/First do this/)).toBeInTheDocument();
		expect(screen.getByText(/Then that/)).toBeInTheDocument();
	});

	it("renders nothing when the body is empty", () => {
		const { container } = render(<Steps>{"   "}</Steps>);
		expect(container.querySelector("section")).toBeNull();
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

describe("AnnotatedCode", () => {
	it("renders the note above the code under a constant 'Code' header", () => {
		render(
			<AnnotatedCode lang="ts" note="This wires the handler.">
				const x = 1;
			</AnnotatedCode>,
		);
		expect(screen.getByText("Code")).toBeInTheDocument();
		expect(screen.getByText("This wires the handler.")).toBeInTheDocument();
	});

	it("renders a 'Code' header even without a note or lang", () => {
		render(<AnnotatedCode>const y = 2;</AnnotatedCode>);
		expect(screen.getByText("Code")).toBeInTheDocument();
	});
});
