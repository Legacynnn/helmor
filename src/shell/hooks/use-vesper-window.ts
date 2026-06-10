// Drives the native macOS window blur for the translucent "Vesper" theme.
//
// Vesper makes the app chrome semi-transparent in CSS; this hook supplies the
// blur *behind* it via a native `NSVisualEffectView` (the `set_window_vibrancy`
// command). Native vibrancy is GPU-composited by the window server — far
// cheaper than a CSS `backdrop-filter` over the whole chrome — so it stays
// smooth.
//
// Fullscreen handling: in a fullscreen space there is no desktop behind the
// window, so the vibrancy material falls back to a green/black cast. When the
// window enters fullscreen we therefore clear the native blur and add a
// `vesper-fullscreen` class so CSS switches to an in-window frosted material
// using backdrop-filter; on exit we restore the native blur.
//
// macOS + Tauri only. Everywhere else Vesper degrades to a plain opaque dark
// theme and this hook is a no-op.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { clearWindowVibrancy, setWindowVibrancy } from "@/lib/api";
import { isMac, isTauriRuntime } from "@/lib/platform";
import { type ColorTheme, resolveTheme, type ThemeMode } from "@/lib/settings";

const FULLSCREEN_CLASS = "vesper-fullscreen";

export type VesperWindowOptions = {
	theme: ThemeMode;
	lightTheme: ColorTheme;
	darkTheme: ColorTheme;
};

// Mirrors the preset resolution in `use-theme-application`: Vesper is active
// whenever it's the preset for the resolved appearance (it then force-darks).
function isVesperActive(
	theme: ThemeMode,
	lightTheme: ColorTheme,
	darkTheme: ColorTheme,
): boolean {
	const effective = resolveTheme(theme);
	const preset = effective === "dark" ? darkTheme : lightTheme;
	return preset === "vesper";
}

export function useVesperWindow(opts: VesperWindowOptions): void {
	const { theme, lightTheme, darkTheme } = opts;

	useEffect(() => {
		// Native blur is macOS-only and needs the Tauri runtime. The mobile
		// companion browser and any non-mac build skip it entirely.
		if (!isTauriRuntime() || !isMac()) return;

		const root = document.documentElement;
		let disposed = false;
		let unlistenResized: (() => void) | undefined;
		// Track the last native call so the high-frequency resize stream doesn't
		// stack multiple NSVisualEffectViews (apply_vibrancy is additive).
		let appliedVibrancy: boolean | undefined;

		let handle: ReturnType<typeof getCurrentWindow> | undefined;
		try {
			handle = getCurrentWindow();
		} catch {
			// No window handle (e.g. stubbed test runtime) — nothing to do.
			return;
		}
		// The handle may be a stub lacking these methods (unit-test / E2E
		// harness where `@tauri-apps/api/window` is aliased). Bail rather than
		// throw inside the passive effect.
		if (
			!handle ||
			typeof handle.isFullscreen !== "function" ||
			typeof handle.onResized !== "function"
		) {
			return;
		}
		const win = handle;

		const setVibrancy = async (on: boolean) => {
			if (appliedVibrancy === on) return;
			appliedVibrancy = on;
			try {
				await (on ? setWindowVibrancy() : clearWindowVibrancy());
			} catch {
				// Re-arm so a later evaluate can retry the transition.
				appliedVibrancy = undefined;
			}
		};

		const evaluate = async () => {
			if (disposed) return;
			if (!isVesperActive(theme, lightTheme, darkTheme)) {
				root.classList.remove(FULLSCREEN_CLASS);
				await setVibrancy(false);
				return;
			}
			let fullscreen = false;
			try {
				fullscreen = await win.isFullscreen();
			} catch {
				fullscreen = false;
			}
			if (disposed) return;
			root.classList.toggle(FULLSCREEN_CLASS, fullscreen);
			// Native desktop blur outside fullscreen, CSS in-window blur inside it.
			await setVibrancy(!fullscreen);
		};

		// macOS fullscreen toggles resize the window, so a resize listener is the
		// reliable signal for enter/exit transitions.
		void win
			.onResized(() => void evaluate())
			.then((fn) => {
				if (disposed) fn();
				else unlistenResized = fn;
			})
			.catch(() => {});

		// System-mode appearance flips can change which preset is active.
		let mq: MediaQueryList | undefined;
		const onMqChange = () => void evaluate();
		if (theme === "system" && typeof window.matchMedia === "function") {
			mq = window.matchMedia("(prefers-color-scheme: dark)");
			mq.addEventListener("change", onMqChange);
		}

		void evaluate();

		return () => {
			disposed = true;
			unlistenResized?.();
			mq?.removeEventListener("change", onMqChange);
		};
	}, [theme, lightTheme, darkTheme]);
}
