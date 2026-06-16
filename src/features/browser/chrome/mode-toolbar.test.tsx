import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ModeToolbar } from "./mode-toolbar";

function renderToolbar(props: Partial<Parameters<typeof ModeToolbar>[0]> = {}) {
	const onSetMode = props.onSetMode ?? vi.fn();
	render(
		<TooltipProvider>
			<ModeToolbar mode={props.mode ?? "none"} onSetMode={onSetMode} />
		</TooltipProvider>,
	);
	return { onSetMode };
}

describe("ModeToolbar", () => {
	afterEach(cleanup);

	it("calls onSetMode when a mode button is clicked", () => {
		const { onSetMode } = renderToolbar({ mode: "none" });
		fireEvent.click(screen.getByRole("button", { name: /comment/i }));
		expect(onSetMode).toHaveBeenCalledWith("comment");
		fireEvent.click(screen.getByRole("button", { name: /^pick/i }));
		expect(onSetMode).toHaveBeenCalledWith("pick");
	});

	it("returns to navigate (none) on Escape", () => {
		const { onSetMode } = renderToolbar({ mode: "comment" });
		fireEvent.keyDown(window, { key: "Escape" });
		expect(onSetMode).toHaveBeenCalledWith("none");
	});

	it("marks exactly the active mode as pressed", () => {
		renderToolbar({ mode: "pick" });
		const pick = screen.getByRole("button", { name: /^pick/i });
		const comment = screen.getByRole("button", { name: /comment/i });
		expect(pick).toHaveAttribute("aria-pressed", "true");
		expect(comment).toHaveAttribute("aria-pressed", "false");
	});

	it("renders Draw as an enabled mode", () => {
		renderToolbar({ mode: "none" });
		expect(screen.getByRole("button", { name: /draw/i })).toBeEnabled();
	});

	it("activating Draw mode calls onSetMode('draw')", () => {
		const { onSetMode } = renderToolbar({ mode: "none" });
		fireEvent.click(screen.getByRole("button", { name: /draw/i }));
		expect(onSetMode).toHaveBeenCalledWith("draw");
	});
});
