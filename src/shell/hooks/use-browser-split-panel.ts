import {
	type KeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useState,
} from "react";
import {
	BROWSER_SPLIT_WIDTH_STORAGE_KEY,
	clampBrowserSplitWidth,
	getInitialBrowserSplitWidth,
} from "@/shell/layout";

const RESIZE_STEP = 16;

// The browser companion panel is anchored to the RIGHT of the workspace pane,
// so a rightward drag (positive deltaX) shrinks it: `startWidth - deltaX`.
// Modeled on `useShellPanels` (inspector side) — drag-time writes go straight
// to the DOM via rAF to skip React render + CSS-var invalidation; the final
// width is committed to React state (and persisted) on pointer-up.
export function useBrowserSplitPanel() {
	const [browserSplitWidth, setBrowserSplitWidthRaw] = useState(
		getInitialBrowserSplitWidth,
	);
	const [resizing, setResizing] = useState(false);

	const setBrowserSplitWidth = useCallback((width: number) => {
		setBrowserSplitWidthRaw(clampBrowserSplitWidth(width));
	}, []);

	useEffect(() => {
		try {
			window.localStorage.setItem(
				BROWSER_SPLIT_WIDTH_STORAGE_KEY,
				String(browserSplitWidth),
			);
		} catch (error) {
			console.error(
				`[helmor] browser split width save failed for "${BROWSER_SPLIT_WIDTH_STORAGE_KEY}"`,
				error,
			);
		}
	}, [browserSplitWidth]);

	const handleBrowserResizeStart = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) return;
			event.preventDefault();

			const node = event.currentTarget;
			const pointerId = event.pointerId;
			try {
				node.setPointerCapture(pointerId);
			} catch {}

			const startX = event.clientX;
			const startWidth = browserSplitWidth;
			const targetPane = document.querySelector<HTMLElement>(
				`[data-shell-pane="browser-split"]`,
			);
			// The chat viewport pads its right edge by the panel width so chat
			// content never sits under the browser pane. Mutate it inline during
			// the drag so chat reflows in lockstep (React state re-applies the
			// same paddingRight on pointer-up, keeping the two consistent).
			const viewport = document.querySelector<HTMLElement>(
				"[data-shell-viewport]",
			);

			let pendingWidth = startWidth;
			let rafId: number | null = null;

			const flushInlineSize = () => {
				rafId = null;
				const widthPx = `${pendingWidth}px`;
				if (targetPane) targetPane.style.width = widthPx;
				if (viewport) viewport.style.paddingRight = widthPx;
			};

			const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
				if (moveEvent.pointerId !== pointerId) return;
				const deltaX = moveEvent.clientX - startX;
				pendingWidth = clampBrowserSplitWidth(startWidth - deltaX);
				if (rafId === null) {
					rafId = window.requestAnimationFrame(flushInlineSize);
				}
			};

			const previousCursor = document.body.style.cursor;
			const previousUserSelect = document.body.style.userSelect;
			document.body.style.cursor = "ew-resize";
			document.body.style.userSelect = "none";

			const overlay = document.createElement("div");
			overlay.style.position = "fixed";
			overlay.style.inset = "0";
			overlay.style.zIndex = "2147483647";
			overlay.style.cursor = "ew-resize";
			overlay.setAttribute("data-helmor-resize-overlay", "");
			overlay.setAttribute("aria-hidden", "true");
			document.body.appendChild(overlay);

			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				if (rafId !== null) {
					window.cancelAnimationFrame(rafId);
					rafId = null;
				}
				flushInlineSize();
				setBrowserSplitWidthRaw(pendingWidth);
				try {
					node.releasePointerCapture(pointerId);
				} catch {}
				node.removeEventListener("pointermove", handlePointerMove);
				node.removeEventListener("pointerup", finish);
				node.removeEventListener("pointercancel", finish);
				node.removeEventListener("lostpointercapture", finish);
				document.body.style.cursor = previousCursor;
				document.body.style.userSelect = previousUserSelect;
				overlay.remove();
				setResizing(false);
			};

			node.addEventListener("pointermove", handlePointerMove);
			node.addEventListener("pointerup", finish);
			node.addEventListener("pointercancel", finish);
			node.addEventListener("lostpointercapture", finish);
			setResizing(true);
		},
		[browserSplitWidth],
	);

	const handleBrowserResizeKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				setBrowserSplitWidthRaw((cur) =>
					clampBrowserSplitWidth(cur + RESIZE_STEP),
				);
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				setBrowserSplitWidthRaw((cur) =>
					clampBrowserSplitWidth(cur - RESIZE_STEP),
				);
			}
		},
		[],
	);

	return {
		browserSplitWidth,
		setBrowserSplitWidth,
		isBrowserResizing: resizing,
		handleBrowserResizeStart,
		handleBrowserResizeKeyDown,
	};
}
