import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawToolPalette } from "./tool-palette";

afterEach(cleanup);

function renderPalette(
	overrides: Partial<Parameters<typeof DrawToolPalette>[0]> = {},
) {
	const props = {
		activeTool: "freehand" as const,
		color: "#e53e3e",
		lineWidth: 4,
		onSelectTool: vi.fn(),
		onSelectColor: vi.fn(),
		onSelectStroke: vi.fn(),
		onUndo: vi.fn(),
		onClear: vi.fn(),
		...overrides,
	};
	render(<DrawToolPalette {...props} />);
	return props;
}

describe("DrawToolPalette", () => {
	it("renders all five tool buttons", () => {
		renderPalette();
		expect(
			screen.getByRole("button", { name: /freehand/i }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /arrow/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /box/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^text$/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /redact/i })).toBeInTheDocument();
	});

	it("calls onSelectTool with the correct tool when clicked", () => {
		const { onSelectTool } = renderPalette();
		fireEvent.click(screen.getByRole("button", { name: /arrow/i }));
		expect(onSelectTool).toHaveBeenCalledWith("arrow");
	});

	it("calls onUndo when undo button clicked", () => {
		const { onUndo } = renderPalette({ activeTool: "box" });
		fireEvent.click(screen.getByRole("button", { name: /undo/i }));
		expect(onUndo).toHaveBeenCalledOnce();
	});

	it("calls onClear when clear button clicked", () => {
		const { onClear } = renderPalette();
		fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
		expect(onClear).toHaveBeenCalledOnce();
	});

	it("active tool button has aria-pressed=true", () => {
		renderPalette({ activeTool: "box" });
		const boxBtn = screen.getByRole("button", { name: /box/i });
		expect(boxBtn).toHaveAttribute("aria-pressed", "true");
	});

	it("calls onSelectColor with a swatch value", () => {
		const { onSelectColor } = renderPalette();
		fireEvent.click(screen.getByRole("button", { name: /color #38a169/i }));
		expect(onSelectColor).toHaveBeenCalledWith("#38a169");
	});

	it("calls onSelectStroke with a width preset", () => {
		const { onSelectStroke } = renderPalette();
		fireEvent.click(screen.getByRole("button", { name: /stroke 8/i }));
		expect(onSelectStroke).toHaveBeenCalledWith(8);
	});
});
