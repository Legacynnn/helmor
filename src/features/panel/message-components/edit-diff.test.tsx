import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiffOpenOptions } from "@/lib/editor-session";
import { EditDiffTrigger } from "./edit-diff";
import { FileLinkProvider } from "./file-link-context";

afterEach(cleanup);

function renderTrigger(
	props: Partial<React.ComponentProps<typeof EditDiffTrigger>> & {
		openDiff?: (path: string, options?: DiffOpenOptions) => void;
		workspaceRootPath?: string | null;
	},
) {
	const { openDiff, workspaceRootPath = "/ws", ...rest } = props;
	return render(
		<FileLinkProvider value={{ openDiff, workspaceRootPath }}>
			<EditDiffTrigger
				file="utils.ts"
				path="src/lib/utils.ts"
				oldStr="old"
				newStr="new"
				{...rest}
			/>
		</FileLinkProvider>,
	);
}

describe("EditDiffTrigger click-to-open-diff", () => {
	it("opens the resolved diff when the trigger is clicked", () => {
		const openDiff = vi.fn();
		renderTrigger({ openDiff });

		fireEvent.click(screen.getByRole("button", { name: /utils\.ts/ }));

		expect(openDiff).toHaveBeenCalledWith("/ws/src/lib/utils.ts", {
			fileStatus: "M",
			preview: true,
		});
	});

	it("passes absolute tool-call paths through unchanged", () => {
		const openDiff = vi.fn();
		renderTrigger({ openDiff, path: "/abs/lib/utils.ts" });

		fireEvent.click(screen.getByRole("button", { name: /utils\.ts/ }));

		expect(openDiff).toHaveBeenCalledWith("/abs/lib/utils.ts", {
			fileStatus: "M",
			preview: true,
		});
	});

	it("does not toggle a wrapping <details> (preventDefault)", () => {
		const openDiff = vi.fn();
		const onToggle = vi.fn();
		render(
			<FileLinkProvider value={{ openDiff, workspaceRootPath: "/ws" }}>
				<details onToggle={onToggle}>
					<summary>
						<EditDiffTrigger
							file="utils.ts"
							path="src/lib/utils.ts"
							oldStr="old"
							newStr="new"
						/>
					</summary>
				</details>
			</FileLinkProvider>,
		);

		const event = new MouseEvent("click", { bubbles: true, cancelable: true });
		const trigger = screen.getByRole("button", { name: /utils\.ts/ });
		const notPrevented = trigger.dispatchEvent(event);

		expect(openDiff).toHaveBeenCalledTimes(1);
		// preventDefault was called → dispatchEvent returns false.
		expect(notPrevented).toBe(false);
	});

	it("opens the diff from the hover popover header", () => {
		const openDiff = vi.fn();
		renderTrigger({ openDiff });

		// Hover to mount the popover.
		fireEvent.mouseEnter(screen.getByRole("button", { name: /utils\.ts/ }));

		// Two buttons now exist (trigger + popover header); click the popover one.
		const buttons = screen.getAllByRole("button", { name: /utils\.ts/ });
		expect(buttons.length).toBeGreaterThan(1);
		fireEvent.click(buttons[buttons.length - 1]);

		expect(openDiff).toHaveBeenCalledWith("/ws/src/lib/utils.ts", {
			fileStatus: "M",
			preview: true,
		});
	});

	it("is not clickable without an openDiff handler", () => {
		renderTrigger({ openDiff: undefined });
		expect(
			screen.queryByRole("button", { name: /utils\.ts/ }),
		).not.toBeInTheDocument();
		// File name still renders (hover preview unaffected).
		expect(screen.getByText("utils.ts")).toBeInTheDocument();
	});

	it("is not clickable for a relative path with no workspace root", () => {
		const openDiff = vi.fn();
		renderTrigger({ openDiff, workspaceRootPath: null });
		expect(
			screen.queryByRole("button", { name: /utils\.ts/ }),
		).not.toBeInTheDocument();
	});
});
