import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveCodePreview } from "./live-code-preview";

// jsdom doesn't implement object URLs; stub them so the blob document plumbing
// runs. The iframe itself never executes in jsdom, so we assert the host's
// state machine, not live React rendering.
beforeEach(() => {
	vi.stubGlobal("URL", {
		...URL,
		createObjectURL: vi.fn(() => "blob:preview-mock"),
		revokeObjectURL: vi.fn(),
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

describe("LiveCodePreview", () => {
	it("starts in a loading state with a sandboxed iframe", () => {
		render(<LiveCodePreview code="function App(){ return null; }" />);
		expect(screen.getByText(/Loading preview/i)).toBeInTheDocument();
		const iframe = screen.getByTitle("Live UI preview") as HTMLIFrameElement;
		expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
		expect(iframe.getAttribute("src")).toBe("blob:preview-mock");
	});

	it("renders the error panel when the sandbox reports an error", () => {
		render(<LiveCodePreview code="function App(){}" />);
		const iframe = screen.getByTitle("Live UI preview") as HTMLIFrameElement;
		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					source: iframe.contentWindow,
					data: {
						source: "helmor-preview",
						type: "error",
						message: "App is not defined",
					},
				}),
			);
		});
		expect(screen.getByText("Preview failed")).toBeInTheDocument();
		expect(screen.getByText("App is not defined")).toBeInTheDocument();
	});

	it("clears loading once the sandbox reports ready", () => {
		render(<LiveCodePreview code="function App(){ return null; }" />);
		const iframe = screen.getByTitle("Live UI preview") as HTMLIFrameElement;
		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					source: iframe.contentWindow,
					data: { source: "helmor-preview", type: "ready" },
				}),
			);
		});
		expect(screen.queryByText(/Loading preview/i)).toBeNull();
	});
});
