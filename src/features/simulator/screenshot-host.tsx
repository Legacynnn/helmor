// Host for the simulator preview. Unlike the browser's native content webview,
// the simulator has no embeddable surface — instead this component polls
// `simulatorScreenshot()` on an interval and renders the captured PNG as an
// `<img>`, cache-busted by the poll tick so the browser refetches each frame.
//
// All IPC is guarded so it no-ops (never throws) under jsdom, where the Tauri
// bridge is absent. `nextScreenshotSrc` is a pure exported helper so the
// cache-bust math is unit-testable without the DOM.
import { useEffect, useState } from "react";
import { convertFileSrc } from "@/lib/ipc";

/** Cache path → cache-busted asset src (poll `tick` busts the browser cache). */
export function nextScreenshotSrc(path: string, tick: number): string {
	return `${convertFileSrc(path)}?t=${tick}`;
}

const POLL_INTERVAL_MS = 500;

export function ScreenshotHost() {
	const [src, setSrc] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const poll = () => {
			void (async () => {
				try {
					const { simulatorScreenshot } = await import("@/lib/api");
					const path = await simulatorScreenshot();
					if (!cancelled && path) {
						setSrc(nextScreenshotSrc(path, Date.now()));
					}
				} catch {
					// No-op under jsdom / when the Tauri bridge is unavailable.
				}
			})();
		};
		poll();
		const timer = setInterval(poll, POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, []);

	return (
		<div className="flex min-h-0 flex-1 items-center justify-center bg-black">
			{src ? (
				<img
					src={src}
					alt="Simulator screen"
					className="max-h-full max-w-full object-contain"
				/>
			) : (
				<span className="text-muted-foreground text-sm">
					Waiting for simulator…
				</span>
			)}
		</div>
	);
}
