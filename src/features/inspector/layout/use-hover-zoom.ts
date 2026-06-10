// Hover-zoom state machine for the inspector tabs panel. Owns:
//   - the three flags that drive the CSS-transitionable expansion
//     (`isHoverExpanded`), the discrete presentation flag that masks the
//     overflow / z-index / data-tabs-zoomed markers (`isZoomPresented`),
//     and the gaussian blur pulse that hides xterm's canvas re-fit
//     artefacts (`isContentBlurred`).
//   - the four mouse-driven event handlers (`onBodyMouseEnter`,
//     `onBodyMouseDown`, `onContainerMouseLeave`,
//     `onTabContextMenuOpenChange`) plus the container-enter ref hook
//     so the parent JSX can keep its data-locality.
//   - the FitAddon suspend/release coordination so each xterm re-fits
//     exactly once after the transition settles, and the
//     text-selection guard that prevents the panel from collapsing
//     while the user is mid-drag.
import { useCallback, useEffect, useRef, useState } from "react";
import { suspendTerminalFit } from "@/components/terminal-output";
import {
	TABS_BLUR_HOLD_UNTIL_MS,
	TABS_HOVER_ACTIVATION_MS,
	TABS_HOVER_COLLAPSE_DELAY_MS,
	TABS_HOVER_TRANSITION_MS,
} from "../layout";
import type { TerminalInstance } from "../terminal-store";
import { useZoomArrowNav } from "./use-zoom-arrow-nav";

/**
 * Window event the Cmd+Shift+J shortcut dispatches to flip the keyboard zoom.
 * Mirrors the existing `helmor:focus-active-terminal` cross-component channel.
 */
export const TOGGLE_TERMINAL_ZOOM_EVENT = "helmor:toggle-terminal-zoom";

export type HoverZoomController = {
	isHoverExpanded: boolean;
	isZoomPresented: boolean;
	isContentBlurred: boolean;
	onBodyMouseEnter(): void;
	onBodyMouseDown(): void;
	onContainerMouseEnter(): void;
	onContainerMouseLeave(): void;
	onTabContextMenuOpenChange(open: boolean): void;
};

export function useHoverZoom({
	open,
	canHoverExpand,
	terminalInstances,
	activeTab,
	onTabChange,
}: {
	open: boolean;
	canHoverExpand: boolean;
	terminalInstances: TerminalInstance[];
	activeTab: string;
	onTabChange: (tabId: string) => void;
}): HoverZoomController {
	// `isHoverExpanded` drives the CSS-transitionable properties (width /
	// height / box-shadow). Flipping it to `false` immediately starts the
	// shrink animation.
	const [isHoverExpanded, setIsHoverExpanded] = useState(false);
	// `isZoomPresented` drives the properties the browser CANNOT transition
	// (z-index, the `data-tabs-zoomed` flag, the border-t for the top
	// edge). Stays `true` for the full duration of BOTH expand and
	// collapse so the zoomed visual identity stays consistent while the
	// size is changing.
	const [isZoomPresented, setIsZoomPresented] = useState(false);
	// Short-lived flag that applies a gaussian blur to the inner
	// header+body while the panel is mid-transition. Masks the frames
	// where xterm's canvas is being GPU-scaled and then re-fit.
	const [isContentBlurred, setIsContentBlurred] = useState(false);

	// Tracks whether the active zoom was started by the keyboard shortcut
	// (sticky — never auto-collapses on mouse-leave, enables arrow tab-nav) or
	// by hover (collapses on mouse-leave after a grace delay). `null` when the
	// panel is at its resting size.
	const zoomSourceRef = useRef<"hover" | "keyboard" | null>(null);
	// Mirror of `zoomSourceRef === "keyboard"` as state so the arrow-nav hook
	// can switch its listener on/off.
	const [isKeyboardZoom, setIsKeyboardZoom] = useState(false);

	const hoverTimerRef = useRef<number | null>(null);
	const presentationClearTimerRef = useRef<number | null>(null);
	const blurClearTimerRef = useRef<number | null>(null);
	// Pending hover-collapse timer — gives the user a grace window to dip the
	// cursor out of the panel and back in without it snapping shut.
	const leaveTimerRef = useRef<number | null>(null);
	const pointerInsideContainerRef = useRef(false);
	// Tracks whether the user is actively selecting text. When true,
	// prevents the panel from collapsing on mouse-leave so text selection
	// can extend beyond the container boundary without interruption.
	const isSelectingRef = useRef(false);
	// Right-click menu portal renders outside the container, so mouseleave
	// fires the moment the cursor crosses into a menu item. Hold the zoom
	// open until the menu closes, then re-check the pointer.
	const isTabContextMenuOpenRef = useRef(false);
	// Holds the outstanding `suspendTerminalFit()` release while the CSS
	// width/height transition is running, plus the timer that will
	// release it and trigger the final fit.
	const terminalFitReleaseRef = useRef<(() => void) | null>(null);
	const fitReleaseTimerRef = useRef<number | null>(null);

	const clearHoverTimer = useCallback(() => {
		if (hoverTimerRef.current !== null) {
			window.clearTimeout(hoverTimerRef.current);
			hoverTimerRef.current = null;
		}
	}, []);

	const clearPresentationClearTimer = useCallback(() => {
		if (presentationClearTimerRef.current !== null) {
			window.clearTimeout(presentationClearTimerRef.current);
			presentationClearTimerRef.current = null;
		}
	}, []);

	const clearBlurTimer = useCallback(() => {
		if (blurClearTimerRef.current !== null) {
			window.clearTimeout(blurClearTimerRef.current);
			blurClearTimerRef.current = null;
		}
	}, []);

	const clearLeaveTimer = useCallback(() => {
		if (leaveTimerRef.current !== null) {
			window.clearTimeout(leaveTimerRef.current);
			leaveTimerRef.current = null;
		}
	}, []);

	// Run a quick fade-in → hold → fade-out blur over the inner content
	// during the transition. Fires on both expand and collapse because
	// the canvas artefacts and the xterm re-fit flash happen in both
	// directions. Calling this while a pulse is already underway just
	// extends the hold window.
	const triggerContentBlurPulse = useCallback(() => {
		clearBlurTimer();
		setIsContentBlurred(true);
		blurClearTimerRef.current = window.setTimeout(() => {
			blurClearTimerRef.current = null;
			setIsContentBlurred(false);
		}, TABS_BLUR_HOLD_UNTIL_MS);
	}, [clearBlurTimer]);

	const releaseTerminalFitLock = useCallback(() => {
		if (fitReleaseTimerRef.current !== null) {
			window.clearTimeout(fitReleaseTimerRef.current);
			fitReleaseTimerRef.current = null;
		}
		if (terminalFitReleaseRef.current) {
			terminalFitReleaseRef.current();
			terminalFitReleaseRef.current = null;
		}
	}, []);

	// Pause every mounted `TerminalOutput`'s FitAddon for the duration
	// of the CSS transition. Without this, each xterm re-fits once per
	// animation frame (reflowing its 5000-line scrollback) which stutters
	// the zoom. Calling this while a suspension is already active just
	// extends the release timer.
	const beginZoomAnimation = useCallback(() => {
		if (!terminalFitReleaseRef.current) {
			terminalFitReleaseRef.current = suspendTerminalFit();
		}
		if (fitReleaseTimerRef.current !== null) {
			window.clearTimeout(fitReleaseTimerRef.current);
		}
		fitReleaseTimerRef.current = window.setTimeout(() => {
			fitReleaseTimerRef.current = null;
			if (terminalFitReleaseRef.current) {
				terminalFitReleaseRef.current();
				terminalFitReleaseRef.current = null;
			}
			// A small safety margin beyond the CSS transition so the final
			// fit uses the settled dimensions rather than the last interpolated
			// frame's.
		}, TABS_HOVER_TRANSITION_MS + 50);
	}, []);

	// Drives both the CSS-transitionable properties and the discrete
	// ones. Expanding flips presentation on immediately; collapsing keeps
	// presentation on until the shrink transition has run to completion,
	// so z-index / overflow / border stay consistent with the shrinking
	// box.
	const setZoomTarget = useCallback(
		(target: boolean) => {
			triggerContentBlurPulse();
			if (target) {
				clearPresentationClearTimer();
				setIsZoomPresented(true);
			} else {
				clearPresentationClearTimer();
				presentationClearTimerRef.current = window.setTimeout(() => {
					presentationClearTimerRef.current = null;
					setIsZoomPresented(false);
				}, TABS_HOVER_TRANSITION_MS + 20);
			}
			setIsHoverExpanded(target);
		},
		[clearPresentationClearTimer, triggerContentBlurPulse],
	);

	// Hover trigger is bound to the BODY only (not the header) so moving
	// the cursor across the Setup/Run tabs or the chevron doesn't start a
	// zoom. The 300ms "hover intent" timer still gives the linger-to-
	// engage feel.
	const onBodyMouseEnter = useCallback(() => {
		if (!open || !canHoverExpand) return;
		if (isHoverExpanded) return;
		clearHoverTimer();
		hoverTimerRef.current = window.setTimeout(() => {
			zoomSourceRef.current = "hover";
			beginZoomAnimation();
			setZoomTarget(true);
			hoverTimerRef.current = null;
		}, TABS_HOVER_ACTIVATION_MS);
	}, [
		beginZoomAnimation,
		canHoverExpand,
		clearHoverTimer,
		isHoverExpanded,
		open,
		setZoomTarget,
	]);

	// Mark the start of a potential text selection. Used to prevent the
	// panel from collapsing while the user is dragging to select text.
	const onBodyMouseDown = useCallback(() => {
		isSelectingRef.current = true;
	}, []);

	const onContainerMouseEnter = useCallback(() => {
		pointerInsideContainerRef.current = true;
		// Cursor came back within the grace window — cancel the pending collapse.
		clearLeaveTimer();
	}, [clearLeaveTimer]);

	// Collapse the panel and reset the zoom source. Shared by the hover-leave
	// path, the keyboard toggle, and the Escape handler.
	const collapseZoom = useCallback(() => {
		zoomSourceRef.current = null;
		setIsKeyboardZoom(false);
		beginZoomAnimation();
		setZoomTarget(false);
	}, [beginZoomAnimation, setZoomTarget]);

	// Un-zoom fires only when the cursor leaves the whole panel (header +
	// body). Moving from body up into the header keeps the zoom alive so
	// the Stop/Rerun action and the tab switcher stay reachable while
	// zoomed. Skip collapsing if the user is actively selecting text.
	// Keyboard-triggered zoom is sticky — it never collapses on mouse-leave.
	const onContainerMouseLeave = useCallback(() => {
		pointerInsideContainerRef.current = false;
		const hadPendingHoverIntent = hoverTimerRef.current !== null;
		clearHoverTimer();
		if (zoomSourceRef.current === "keyboard") return;
		if (isSelectingRef.current) return;
		if (isTabContextMenuOpenRef.current) return;
		if (hadPendingHoverIntent || (!isHoverExpanded && !isZoomPresented)) {
			return;
		}
		// Defer the collapse so a quick out-and-back-in doesn't snap the panel
		// shut. `onContainerMouseEnter` cancels this if the cursor returns.
		clearLeaveTimer();
		leaveTimerRef.current = window.setTimeout(() => {
			leaveTimerRef.current = null;
			collapseZoom();
		}, TABS_HOVER_COLLAPSE_DELAY_MS);
	}, [
		clearHoverTimer,
		clearLeaveTimer,
		collapseZoom,
		isHoverExpanded,
		isZoomPresented,
	]);

	// On close, re-evaluate whether to collapse — the mouseleave that
	// fired while the menu was open was suppressed.
	const onTabContextMenuOpenChange = useCallback(
		(menuOpen: boolean) => {
			isTabContextMenuOpenRef.current = menuOpen;
			if (menuOpen) return;
			if (zoomSourceRef.current === "keyboard") return;
			if (pointerInsideContainerRef.current) return;
			if (!isHoverExpanded && !isZoomPresented) return;
			collapseZoom();
		},
		[collapseZoom, isHoverExpanded, isZoomPresented],
	);

	// Switch the active inspector tab by a relative offset (wrap-around)
	// across the WHOLE strip — Setup, Run, then each terminal — so the arrows
	// flip between every tab, not just terminals. Live while the panel is
	// keyboard-zoomed.
	const navigateTab = useCallback(
		(offset: -1 | 1) => {
			const tabIds = ["setup", "run", ...terminalInstances.map((t) => t.id)];
			const idx = tabIds.indexOf(activeTab);
			if (idx === -1) return;
			const len = tabIds.length;
			const next = tabIds[(idx + offset + len) % len];
			if (next && next !== activeTab) onTabChange(next);
		},
		[terminalInstances, activeTab, onTabChange],
	);

	// Cmd+Shift+J toggle: expand if resting, collapse if already zoomed.
	// Expanding only requires the panel to be open — the shortcut handler
	// ensures a terminal tab is active before dispatching, so this bypasses
	// the hover-only `terminalHoverExpansion` setting by design.
	const toggleKeyboardZoom = useCallback(() => {
		clearHoverTimer();
		clearLeaveTimer();
		if (isHoverExpanded || isZoomPresented) {
			collapseZoom();
			return;
		}
		if (!open) return;
		zoomSourceRef.current = "keyboard";
		setIsKeyboardZoom(true);
		beginZoomAnimation();
		setZoomTarget(true);
	}, [
		beginZoomAnimation,
		clearHoverTimer,
		clearLeaveTimer,
		collapseZoom,
		isHoverExpanded,
		isZoomPresented,
		open,
		setZoomTarget,
	]);

	// Bridge from the Cmd+Shift+J shortcut (dispatched in the inspector) to the
	// zoom state that lives here. Mirrors the `helmor:focus-active-terminal`
	// window-event channel already used for cross-component terminal control.
	useEffect(() => {
		const handleToggle = () => toggleKeyboardZoom();
		window.addEventListener(TOGGLE_TERMINAL_ZOOM_EVENT, handleToggle);
		return () =>
			window.removeEventListener(TOGGLE_TERMINAL_ZOOM_EVENT, handleToggle);
	}, [toggleKeyboardZoom]);

	// Escape collapses a keyboard-zoomed panel, matching the toggle's mental
	// model. Capture phase so it wins over anything inside the panel.
	useEffect(() => {
		if (!isKeyboardZoom) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			collapseZoom();
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [isKeyboardZoom, collapseZoom]);

	// Left/Right tab navigation, live only while keyboard-zoomed.
	useZoomArrowNav({ active: isKeyboardZoom, onNavigate: navigateTab });

	// When the panel collapses we must drop any pending/active zoom so it
	// doesn't linger over neighbouring sections. Also release any
	// outstanding terminal-fit lock immediately.
	useEffect(() => {
		if (!open) {
			clearHoverTimer();
			clearPresentationClearTimer();
			clearBlurTimer();
			clearLeaveTimer();
			releaseTerminalFitLock();
			zoomSourceRef.current = null;
			setIsKeyboardZoom(false);
			setIsHoverExpanded(false);
			setIsZoomPresented(false);
			setIsContentBlurred(false);
		}
	}, [
		clearBlurTimer,
		clearHoverTimer,
		clearLeaveTimer,
		clearPresentationClearTimer,
		open,
		releaseTerminalFitLock,
	]);

	// If the active tab no longer has output worth zooming (e.g. user
	// switched from Run to Setup), force the panel back to its resting
	// size through the normal collapse transition. Keyboard-driven zoom is
	// sticky, though — the user explicitly expanded the panel and is arrowing
	// across the whole tab strip, so a non-zoomable tab must not collapse it.
	useEffect(() => {
		if (canHoverExpand) return;
		if (zoomSourceRef.current === "keyboard") return;
		clearHoverTimer();
		clearLeaveTimer();
		if (pointerInsideContainerRef.current) return;
		if (!isHoverExpanded && !isZoomPresented) return;
		collapseZoom();
	}, [
		canHoverExpand,
		clearHoverTimer,
		clearLeaveTimer,
		collapseZoom,
		isHoverExpanded,
		isZoomPresented,
	]);

	// Clear the selection flag on any mouseup, even if it happens outside
	// the panel. Ensures the collapse-on-leave behaviour resumes after
	// the user finishes a text selection.
	useEffect(() => {
		const handleGlobalMouseUp = () => {
			isSelectingRef.current = false;
		};
		document.addEventListener("mouseup", handleGlobalMouseUp);
		return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
	}, []);

	// Clean up any pending timer on unmount.
	useEffect(() => {
		return () => {
			clearHoverTimer();
			clearPresentationClearTimer();
			clearBlurTimer();
			clearLeaveTimer();
			releaseTerminalFitLock();
		};
	}, [
		clearBlurTimer,
		clearHoverTimer,
		clearLeaveTimer,
		clearPresentationClearTimer,
		releaseTerminalFitLock,
	]);

	return {
		isHoverExpanded,
		isZoomPresented,
		isContentBlurred,
		onBodyMouseEnter,
		onBodyMouseDown,
		onContainerMouseEnter,
		onContainerMouseLeave,
		onTabContextMenuOpenChange,
	};
}
