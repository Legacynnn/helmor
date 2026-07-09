import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { isMac, isTauriRuntime } from "@/lib/platform";

/** Root class toggled while the macOS window is in native fullscreen. */
const FULLSCREEN_CLASS = "app-fullscreen";

/**
 * Toggle a root `app-fullscreen` class whenever the macOS window enters/exits
 * native fullscreen. Unlike `useVesperWindow` (which gates the class on the
 * Vesper theme for its blur handling), this is theme-independent, so chrome
 * layout can react to fullscreen purely via CSS — e.g. the sidebar's collapse
 * control moves to the right once the traffic lights disappear. No-op off
 * macOS / outside the Tauri runtime.
 */
export function useWindowFullscreen(): void {
	useEffect(() => {
		if (!isTauriRuntime() || !isMac()) return;

		const root = document.documentElement;
		let disposed = false;
		let unlisten: (() => void) | undefined;

		let handle: ReturnType<typeof getCurrentWindow> | undefined;
		try {
			handle = getCurrentWindow();
		} catch {
			return;
		}
		// Stubbed handle in test/E2E runtimes — bail rather than throw.
		if (
			!handle ||
			typeof handle.isFullscreen !== "function" ||
			typeof handle.onResized !== "function"
		) {
			return;
		}
		const win = handle;

		const evaluate = async () => {
			if (disposed) return;
			let fullscreen = false;
			try {
				fullscreen = await win.isFullscreen();
			} catch {
				fullscreen = false;
			}
			if (disposed) return;
			root.classList.toggle(FULLSCREEN_CLASS, fullscreen);
		};

		// macOS fullscreen enter/exit resizes the window, so onResized is the
		// reliable transition signal.
		void win
			.onResized(() => void evaluate())
			.then((u) => {
				if (disposed) u();
				else unlisten = u;
			})
			.catch(() => {});
		void evaluate();

		return () => {
			disposed = true;
			unlisten?.();
			root.classList.remove(FULLSCREEN_CLASS);
		};
	}, []);
}
