// Host element for the embedded content webview. The actual page renders in a
// native webview positioned by Rust over this element's bounding rect; this
// component only owns the placeholder <div> and the rect-reporting lifecycle:
//
//   mount (with a URL)  -> browserCreate(url, rect)
//   active URL changes  -> browserNavigate(url)
//   host resizes / window resizes -> debounced browserSetBounds(rect)
//   unmount             -> browserDestroy()
//
// All IPC is guarded so it no-ops (and never throws) under jsdom, where the
// Tauri bridge is absent. `rectFromElement` is a pure exported helper so the
// rect math is unit-testable without a DOM-positioned element.
import { useEffect, useRef } from "react";
import type { BrowserRect } from "@/lib/api";
import { deviceRectInHost, type ViewportPreset } from "./viewport/presets";

/** Logical-pixel rect from an element's bounding box (rounded to whole px). */
export function rectFromElement(el: HTMLElement): BrowserRect {
	const r = el.getBoundingClientRect();
	return {
		x: Math.round(r.x),
		y: Math.round(r.y),
		width: Math.round(r.width),
		height: Math.round(r.height),
	};
}

type ContentHostProps = {
	/** Owning workspace; scopes the agent-control surface registration. */
	workspaceId: string;
	url: string | null;
	/**
	 * Whether the surface is actually visible. The native webview is created
	 * only on the first render where this is true (PRD §6 lazy-mount), so a host
	 * that is mounted-but-hidden never spawns a webview until first shown.
	 */
	shown: boolean;
	/** Active device preset; when fixed-size, the webview is constrained. */
	viewport?: ViewportPreset | null;
	/** Bumped by the bridge store on dev-server reload to force a refresh. */
	reloadNonce?: number;
};

const BOUNDS_DEBOUNCE_MS = 50;

export function ContentHost({
	workspaceId,
	url,
	shown,
	viewport,
	reloadNonce,
}: ContentHostProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	// Track whether the webview has been created so navigation/bounds updates
	// only fire once it exists.
	const createdRef = useRef(false);
	const urlRef = useRef(url);
	urlRef.current = url;
	const workspaceIdRef = useRef(workspaceId);
	workspaceIdRef.current = workspaceId;
	// Read the live preset through a ref so the bounds effect stays mount-once.
	const viewportRef = useRef(viewport);
	viewportRef.current = viewport;

	// Lazy create: only once the surface is first shown WITH a url. Reads the
	// url/workspace through refs so this effect re-runs only on `shown` change,
	// and the `createdRef` guard makes it idempotent across re-shows (PRD §6 —
	// exactly one live child-webview, created on first use).
	useEffect(() => {
		const host = hostRef.current;
		const initialUrl = urlRef.current;
		const wsId = workspaceIdRef.current;
		if (!host || !shown || !initialUrl || createdRef.current) return;

		void (async () => {
			try {
				const { browserCreate } = await import("@/lib/api");
				await browserCreate(wsId, initialUrl, rectFromElement(host));
				createdRef.current = true;
			} catch {
				// No-op under jsdom / when the Tauri bridge is unavailable.
			}
		})();
	}, [shown]);

	// Tear down on unmount (independent of `shown`), fully releasing the webview.
	useEffect(() => {
		return () => {
			const wsId = workspaceIdRef.current;
			createdRef.current = false;
			void (async () => {
				try {
					const { browserDestroy } = await import("@/lib/api");
					await browserDestroy(wsId);
				} catch {
					// No-op.
				}
			})();
		};
	}, []);

	// Navigate when the active URL changes (after creation).
	useEffect(() => {
		if (!url || !createdRef.current) return;
		void (async () => {
			try {
				const { browserNavigate } = await import("@/lib/api");
				await browserNavigate(url);
			} catch {
				// No-op.
			}
		})();
	}, [url]);

	// Track the host rect via ResizeObserver + window resize, debounced.
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		let timer: ReturnType<typeof setTimeout> | null = null;
		const pushBounds = () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				if (!createdRef.current) return;
				const preset = viewportRef.current;
				const rect = preset
					? deviceRectInHost(preset, rectFromElement(host))
					: rectFromElement(host);
				void (async () => {
					try {
						const { browserSetBounds } = await import("@/lib/api");
						await browserSetBounds(rect);
					} catch {
						// No-op.
					}
				})();
			}, BOUNDS_DEBOUNCE_MS);
		};

		const observer =
			typeof ResizeObserver !== "undefined"
				? new ResizeObserver(pushBounds)
				: null;
		observer?.observe(host);
		window.addEventListener("resize", pushBounds);

		return () => {
			if (timer) clearTimeout(timer);
			observer?.disconnect();
			window.removeEventListener("resize", pushBounds);
		};
	}, []);

	// Re-apply bounds when the device preset changes (so switching preset
	// resizes the webview immediately, not just on the next host resize).
	useEffect(() => {
		const host = hostRef.current;
		if (!host || !createdRef.current) return;
		const rect = viewport
			? deviceRectInHost(viewport, rectFromElement(host))
			: rectFromElement(host);
		void (async () => {
			try {
				const { browserSetBounds } = await import("@/lib/api");
				await browserSetBounds(rect);
			} catch {
				// No-op.
			}
		})();
	}, [viewport]);

	// Re-navigate the active tab when a dev-server reload is detected so agent
	// edits appear live. Skips the initial mount (nonce 0).
	const firstReloadRef = useRef(true);
	useEffect(() => {
		if (firstReloadRef.current) {
			firstReloadRef.current = false;
			return;
		}
		if (!url || !createdRef.current) return;
		void (async () => {
			try {
				const { browserNavigate } = await import("@/lib/api");
				await browserNavigate(url);
			} catch {
				// No-op.
			}
		})();
	}, [reloadNonce, url]);

	return (
		<div
			ref={hostRef}
			aria-label="Browser content"
			className="flex min-h-0 flex-1 bg-background"
		/>
	);
}
