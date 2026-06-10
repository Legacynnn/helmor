import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";
import {
	InspectorTabsSection,
	TABS_BLUR_HOLD_UNTIL_MS,
	TABS_HOVER_ACTIVATION_MS,
	TABS_HOVER_COLLAPSE_DELAY_MS,
	TABS_HOVER_ZOOM_MULTIPLIER,
} from "./layout";
import { TOGGLE_TERMINAL_ZOOM_EVENT } from "./layout/use-hover-zoom";
import type { TerminalInstance } from "./terminal-store";

function makeTerminal(id: string): TerminalInstance {
	return {
		id,
		repoId: "repo",
		chunks: [],
		bufferedBytes: 0,
		truncated: false,
		status: "running",
		exitCode: null,
		hoverZoomDisabled: false,
	};
}

describe("InspectorTabsSection", () => {
	afterEach(() => {
		vi.useRealTimers();
		cleanup();
	});

	it("does not re-trigger blur when moving from header back into body while zoomed", () => {
		vi.useFakeTimers();

		renderWithProviders(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={vi.fn()}
				activeTab="run"
				onTabChange={vi.fn()}
				setupScriptState="idle"
				runScriptState="running"
				runTabLabel="Run"
				workspaceId={null}
				runActions={[]}
				activeRunActionId={null}
				onSelectRunAction={vi.fn()}
				onCreateRunAction={vi.fn()}
				terminalInstances={[]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				onToggleTerminalHoverZoom={vi.fn()}
				canSpawnTerminal={false}
				canHoverExpand
			>
				<div>Terminal body</div>
			</InspectorTabsSection>,
		);

		const tabsBody = screen.getByLabelText("Inspector tabs body");
		const filterLayer = tabsBody.parentElement as HTMLElement;
		const header = screen.getByRole("tablist").parentElement as HTMLElement;

		fireEvent.mouseEnter(tabsBody);
		act(() => {
			vi.advanceTimersByTime(TABS_HOVER_ACTIVATION_MS);
		});

		expect(filterLayer).toHaveStyle({ filter: "blur(6px)" });

		act(() => {
			vi.advanceTimersByTime(TABS_BLUR_HOLD_UNTIL_MS);
		});

		expect(filterLayer).toHaveStyle({ filter: "blur(0)" });

		fireEvent.mouseEnter(header);
		fireEvent.mouseEnter(tabsBody);

		expect(filterLayer).toHaveStyle({ filter: "blur(0)" });
	});

	it("stays zoomed when the active tab becomes non-zoomable until the pointer leaves", () => {
		vi.useFakeTimers();

		const view = renderWithProviders(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={vi.fn()}
				activeTab="run"
				onTabChange={vi.fn()}
				setupScriptState="idle"
				runScriptState="running"
				runTabLabel="Run"
				workspaceId={null}
				runActions={[]}
				activeRunActionId={null}
				onSelectRunAction={vi.fn()}
				onCreateRunAction={vi.fn()}
				terminalInstances={[]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				onToggleTerminalHoverZoom={vi.fn()}
				canSpawnTerminal={false}
				canHoverExpand
			>
				<div>Terminal body</div>
			</InspectorTabsSection>,
		);

		const tabsBody = screen.getByLabelText("Inspector tabs body");
		const zoomContainer = screen.getByLabelText("Inspector section Tabs")
			.parentElement as HTMLElement;
		const expectedZoomedSize = `${TABS_HOVER_ZOOM_MULTIPLIER * 100}%`;

		fireEvent.mouseEnter(zoomContainer);
		fireEvent.mouseEnter(tabsBody);
		act(() => {
			vi.advanceTimersByTime(TABS_HOVER_ACTIVATION_MS);
			vi.advanceTimersByTime(TABS_BLUR_HOLD_UNTIL_MS);
		});

		expect(zoomContainer).toHaveStyle({ width: expectedZoomedSize });

		view.rerender(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={vi.fn()}
				activeTab="setup"
				onTabChange={vi.fn()}
				setupScriptState="idle"
				runScriptState="running"
				runTabLabel="Run"
				workspaceId={null}
				runActions={[]}
				activeRunActionId={null}
				onSelectRunAction={vi.fn()}
				onCreateRunAction={vi.fn()}
				terminalInstances={[]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				onToggleTerminalHoverZoom={vi.fn()}
				canSpawnTerminal={false}
				canHoverExpand={false}
			>
				<div>Placeholder body</div>
			</InspectorTabsSection>,
		);

		expect(zoomContainer).toHaveStyle({ width: expectedZoomedSize });

		fireEvent.mouseLeave(zoomContainer);

		// Hover-originated zoom collapses after a grace delay, not immediately —
		// the blur pulse (which marks the start of the collapse) only fires once
		// the delay elapses.
		expect(zoomContainer.firstElementChild?.firstElementChild).toHaveStyle({
			filter: "blur(0)",
		});

		act(() => {
			vi.advanceTimersByTime(TABS_HOVER_COLLAPSE_DELAY_MS);
		});

		expect(zoomContainer.firstElementChild?.firstElementChild).toHaveStyle({
			filter: "blur(6px)",
		});
	});

	it("does not re-pulse the blur when a collapse is re-triggered mid-animation", () => {
		vi.useFakeTimers();

		const baseProps = {
			wrapperRef: createRef<HTMLDivElement>(),
			open: true as const,
			onToggle: vi.fn(),
			activeTab: "run",
			onTabChange: vi.fn(),
			setupScriptState: "idle" as const,
			runScriptState: "running" as const,
			runTabLabel: "Run",
			workspaceId: null,
			runActions: [],
			activeRunActionId: null,
			onSelectRunAction: vi.fn(),
			onCreateRunAction: vi.fn(),
			terminalInstances: [],
			onAddTerminal: vi.fn(),
			onCloseTerminal: vi.fn(),
			onToggleTerminalHoverZoom: vi.fn(),
			canSpawnTerminal: false,
		};

		const view = renderWithProviders(
			<InspectorTabsSection {...baseProps} canHoverExpand>
				<div>Terminal body</div>
			</InspectorTabsSection>,
		);

		const tabsBody = screen.getByLabelText("Inspector tabs body");
		const zoomContainer = screen.getByLabelText("Inspector section Tabs")
			.parentElement as HTMLElement;
		const blurLayer = () =>
			zoomContainer.firstElementChild?.firstElementChild as HTMLElement;

		// Hover-zoom in.
		fireEvent.mouseEnter(zoomContainer);
		fireEvent.mouseEnter(tabsBody);
		act(() => {
			vi.advanceTimersByTime(TABS_HOVER_ACTIVATION_MS);
			vi.advanceTimersByTime(TABS_BLUR_HOLD_UNTIL_MS);
		});

		// First collapse: cursor leaves → delayed collapse fires its single blur
		// pulse, which then clears. `isZoomPresented` is still true during the
		// shrink (it lingers until TABS_HOVER_TRANSITION_MS + 20 after collapse).
		fireEvent.mouseLeave(zoomContainer);
		act(() => {
			vi.advanceTimersByTime(TABS_HOVER_COLLAPSE_DELAY_MS);
			vi.advanceTimersByTime(TABS_BLUR_HOLD_UNTIL_MS);
		});
		expect(blurLayer()).toHaveStyle({ filter: "blur(0)" });

		// A second collapse trigger arrives mid-animation (the active tab becomes
		// non-zoomable, as when closing a terminal). It must NOT fire a second
		// blur pulse — the panel is already collapsing.
		view.rerender(
			<InspectorTabsSection {...baseProps} canHoverExpand={false}>
				<div>Terminal body</div>
			</InspectorTabsSection>,
		);
		expect(blurLayer()).toHaveStyle({ filter: "blur(0)" });
	});

	it("cancels the pending collapse when the cursor returns within the grace window", () => {
		vi.useFakeTimers();

		renderWithProviders(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={vi.fn()}
				activeTab="run"
				onTabChange={vi.fn()}
				setupScriptState="idle"
				runScriptState="running"
				runTabLabel="Run"
				workspaceId={null}
				runActions={[]}
				activeRunActionId={null}
				onSelectRunAction={vi.fn()}
				onCreateRunAction={vi.fn()}
				terminalInstances={[]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				onToggleTerminalHoverZoom={vi.fn()}
				canSpawnTerminal={false}
				canHoverExpand
			>
				<div>Terminal body</div>
			</InspectorTabsSection>,
		);

		const tabsBody = screen.getByLabelText("Inspector tabs body");
		const zoomContainer = screen.getByLabelText("Inspector section Tabs")
			.parentElement as HTMLElement;
		const expectedZoomedSize = `${TABS_HOVER_ZOOM_MULTIPLIER * 100}%`;

		fireEvent.mouseEnter(zoomContainer);
		fireEvent.mouseEnter(tabsBody);
		act(() => {
			vi.advanceTimersByTime(TABS_HOVER_ACTIVATION_MS);
			vi.advanceTimersByTime(TABS_BLUR_HOLD_UNTIL_MS);
		});
		expect(zoomContainer).toHaveStyle({ width: expectedZoomedSize });

		// Cursor dips out, then returns before the grace delay elapses.
		fireEvent.mouseLeave(zoomContainer);
		act(() => {
			vi.advanceTimersByTime(TABS_HOVER_COLLAPSE_DELAY_MS - 50);
		});
		fireEvent.mouseEnter(zoomContainer);
		act(() => {
			vi.advanceTimersByTime(TABS_HOVER_COLLAPSE_DELAY_MS);
		});

		// Still zoomed — the pending collapse was cancelled.
		expect(zoomContainer).toHaveStyle({ width: expectedZoomedSize });
	});

	it("keyboard zoom toggles the panel and stays sticky on mouse-leave", () => {
		vi.useFakeTimers();

		renderWithProviders(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={vi.fn()}
				activeTab="term-1"
				onTabChange={vi.fn()}
				setupScriptState="idle"
				runScriptState="idle"
				runTabLabel="Run"
				workspaceId={null}
				runActions={[]}
				activeRunActionId={null}
				onSelectRunAction={vi.fn()}
				onCreateRunAction={vi.fn()}
				terminalInstances={[makeTerminal("term-1")]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				onToggleTerminalHoverZoom={vi.fn()}
				canSpawnTerminal
				canHoverExpand
			>
				<div>Terminal body</div>
			</InspectorTabsSection>,
		);

		const zoomContainer = screen.getByLabelText("Inspector section Tabs")
			.parentElement as HTMLElement;
		const expectedZoomedSize = `${TABS_HOVER_ZOOM_MULTIPLIER * 100}%`;

		// Press the shortcut (dispatched as a window event) → expands.
		act(() => {
			window.dispatchEvent(new Event(TOGGLE_TERMINAL_ZOOM_EVENT));
			vi.advanceTimersByTime(TABS_BLUR_HOLD_UNTIL_MS);
		});
		expect(zoomContainer).toHaveStyle({ width: expectedZoomedSize });

		// Mouse leaving does NOT collapse a keyboard-triggered zoom.
		fireEvent.mouseLeave(zoomContainer);
		act(() => {
			vi.advanceTimersByTime(TABS_HOVER_COLLAPSE_DELAY_MS * 2);
		});
		expect(zoomContainer).toHaveStyle({ width: expectedZoomedSize });

		// Second press collapses.
		act(() => {
			window.dispatchEvent(new Event(TOGGLE_TERMINAL_ZOOM_EVENT));
			vi.advanceTimersByTime(TABS_BLUR_HOLD_UNTIL_MS);
		});
		expect(zoomContainer).toHaveStyle({ width: "100%" });
	});

	it("arrow keys cycle the whole tab strip (setup/run/terminals) while keyboard-zoomed", () => {
		vi.useFakeTimers();
		const onTabChange = vi.fn();

		renderWithProviders(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={vi.fn()}
				activeTab="term-1"
				onTabChange={onTabChange}
				setupScriptState="idle"
				runScriptState="idle"
				runTabLabel="Run"
				workspaceId={null}
				runActions={[]}
				activeRunActionId={null}
				onSelectRunAction={vi.fn()}
				onCreateRunAction={vi.fn()}
				terminalInstances={[makeTerminal("term-1"), makeTerminal("term-2")]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				onToggleTerminalHoverZoom={vi.fn()}
				canSpawnTerminal
				canHoverExpand
			>
				<div>Terminal body</div>
			</InspectorTabsSection>,
		);

		// Arrows do nothing before the panel is keyboard-zoomed.
		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
		});
		expect(onTabChange).not.toHaveBeenCalled();

		// Expand via the shortcut. Strip order is [setup, run, term-1, term-2];
		// from term-1, Right advances to term-2.
		act(() => {
			window.dispatchEvent(new Event(TOGGLE_TERMINAL_ZOOM_EVENT));
		});
		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
		});
		expect(onTabChange).toHaveBeenCalledWith("term-2");

		// Left from term-1 steps back onto the Run tab (not just terminals).
		onTabChange.mockClear();
		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
		});
		expect(onTabChange).toHaveBeenCalledWith("run");

		// Modified arrows are ignored (reserved for Mod+Alt+Arrow prev/next).
		onTabChange.mockClear();
		act(() => {
			window.dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true }),
			);
		});
		expect(onTabChange).not.toHaveBeenCalled();
	});

	it("renders the Run dropdown chevron and exposes 'Create'", async () => {
		const onCreate = vi.fn();
		const onSelect = vi.fn();
		const { userEvent: makeUser } = await import("@testing-library/user-event");
		const user = makeUser.setup();
		renderWithProviders(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={vi.fn()}
				activeTab="run"
				onTabChange={vi.fn()}
				setupScriptState="idle"
				runScriptState="idle"
				runTabLabel="Run"
				workspaceId={null}
				runActions={[
					{
						id: "a1",
						name: "Dev",
						command: "npm run dev",
						mode: "concurrent",
						fromProject: false,
					},
					{
						id: "a2",
						name: "Tests",
						command: "npm test",
						mode: "concurrent",
						fromProject: false,
					},
				]}
				activeRunActionId="a1"
				onSelectRunAction={onSelect}
				onCreateRunAction={onCreate}
				terminalInstances={[]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				onToggleTerminalHoverZoom={vi.fn()}
				canSpawnTerminal={false}
				canHoverExpand
			>
				<div>Body</div>
			</InspectorTabsSection>,
		);

		// Chevron trigger sits next to the Run tab. Click opens the menu.
		const trigger = screen.getByRole("button", { name: /switch run action/i });
		await user.click(trigger);

		// Both actions and the Create entry are now in the menu.
		expect(
			screen.getByRole("menuitemradio", { name: /^dev$/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("menuitemradio", { name: /^tests$/i }),
		).toBeInTheDocument();
		const createEntry = screen.getByRole("menuitem", {
			name: /^create$/i,
		});

		await user.click(createEntry);
		expect(onCreate).toHaveBeenCalledTimes(1);
	});

	it("Run dropdown radio selection fires onSelectRunAction", async () => {
		const onSelect = vi.fn();
		const { userEvent: makeUser } = await import("@testing-library/user-event");
		const user = makeUser.setup();
		renderWithProviders(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={vi.fn()}
				activeTab="run"
				onTabChange={vi.fn()}
				setupScriptState="idle"
				runScriptState="idle"
				runTabLabel="Run"
				workspaceId={null}
				runActions={[
					{
						id: "a1",
						name: "Dev",
						command: "npm run dev",
						mode: "concurrent",
						fromProject: false,
					},
					{
						id: "a2",
						name: "Tests",
						command: "npm test",
						mode: "concurrent",
						fromProject: false,
					},
				]}
				activeRunActionId="a1"
				onSelectRunAction={onSelect}
				onCreateRunAction={vi.fn()}
				terminalInstances={[]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				onToggleTerminalHoverZoom={vi.fn()}
				canSpawnTerminal={false}
				canHoverExpand
			>
				<div>Body</div>
			</InspectorTabsSection>,
		);

		await user.click(
			screen.getByRole("button", { name: /switch run action/i }),
		);
		await user.click(screen.getByRole("menuitemradio", { name: /^tests$/i }));
		expect(onSelect).toHaveBeenCalledWith("a2");
	});
});
