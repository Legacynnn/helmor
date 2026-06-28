import { useReactFlow, type Viewport } from "@xyflow/react";
import { type RefObject, useEffect } from "react";

/** WebKit's non-standard trackpad-pinch event (Safari / Tauri webview). It is
 * not in lib.dom, so we model the only fields we read. */
interface WebKitGestureEvent {
	scale: number;
	clientX: number;
	clientY: number;
	preventDefault: () => void;
}

/**
 * Pinch-to-zoom for the canvas inside Tauri's WebKit webview.
 *
 * React Flow only zooms on `ctrlKey` wheel events, which Chromium synthesises
 * for a trackpad pinch but **WebKit does not** — WebKit instead fires the
 * non-standard `gesturestart`/`gesturechange`/`gestureend` events. With
 * `panOnScroll` on (two-finger swipe = pan) there is no wheel-based zoom left,
 * so we wire the pinch gesture to React Flow's viewport ourselves, anchored on
 * the cursor. (Chromium pinch keeps flowing through React Flow's own ctrlKey
 * path; it never emits these gesture events, so there is no double-handling.)
 */
export function usePinchZoom(
	wrapperRef: RefObject<HTMLElement | null>,
	options: {
		minZoom: number;
		maxZoom: number;
		onCommit?: (viewport: Viewport) => void;
	},
) {
	const { getViewport, setViewport } = useReactFlow();
	const { minZoom, maxZoom, onCommit } = options;

	useEffect(() => {
		const el = wrapperRef.current;
		if (!el) return;

		// `scale` is cumulative from gesture start; track it to derive a
		// per-frame factor we apply to the live viewport zoom.
		let lastScale = 1;

		const onStart = (event: Event) => {
			(event as unknown as WebKitGestureEvent).preventDefault();
			lastScale = 1;
		};

		const onChange = (event: Event) => {
			const e = event as unknown as WebKitGestureEvent;
			e.preventDefault();
			const factor = e.scale / lastScale;
			lastScale = e.scale;
			if (!Number.isFinite(factor) || factor <= 0) return;

			const vp = getViewport();
			const nextZoom = Math.min(maxZoom, Math.max(minZoom, vp.zoom * factor));
			if (nextZoom === vp.zoom) return;

			// Keep the world point under the cursor fixed while zooming.
			const rect = el.getBoundingClientRect();
			const px = e.clientX - rect.left;
			const py = e.clientY - rect.top;
			const worldX = (px - vp.x) / vp.zoom;
			const worldY = (py - vp.y) / vp.zoom;
			setViewport({
				x: px - worldX * nextZoom,
				y: py - worldY * nextZoom,
				zoom: nextZoom,
			});
		};

		const onEnd = (event: Event) => {
			(event as unknown as WebKitGestureEvent).preventDefault();
			lastScale = 1;
			onCommit?.(getViewport());
		};

		el.addEventListener("gesturestart", onStart, { passive: false });
		el.addEventListener("gesturechange", onChange, { passive: false });
		el.addEventListener("gestureend", onEnd, { passive: false });
		return () => {
			el.removeEventListener("gesturestart", onStart);
			el.removeEventListener("gesturechange", onChange);
			el.removeEventListener("gestureend", onEnd);
		};
	}, [wrapperRef, getViewport, setViewport, minZoom, maxZoom, onCommit]);
}
