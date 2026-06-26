import { cn } from "@/lib/utils";
import { accentClasses, type PlanAccent } from "../shell/accent";

/**
 * Per-canvas visual mode, set via `<PlanCanvas theme="...">`.
 * - `repo` (default): frames use their semantic accent + real color — the
 *   "polished, repo-themed" look.
 * - `wireframe`: low-fidelity focus. A `grayscale` filter desaturates the whole
 *   frame body (even live previews) and chrome falls back to neutral, so the
 *   reader focuses on layout, not color.
 */
export type CanvasTheme = "repo" | "wireframe";

const THEMES = new Set<CanvasTheme>(["repo", "wireframe"]);

/** Resolve a `theme=` prop to a known theme, defaulting to `repo`. */
export function normalizeTheme(value: string | undefined): CanvasTheme {
	return value && THEMES.has(value as CanvasTheme)
		? (value as CanvasTheme)
		: "repo";
}

/** Semantic accent for a frame, defaulting to neutral. */
export function normalizeAccent(value: string | undefined): PlanAccent {
	const accents: PlanAccent[] = [
		"neutral",
		"info",
		"warning",
		"danger",
		"success",
		"highlight",
	];
	return value && accents.includes(value as PlanAccent)
		? (value as PlanAccent)
		: "neutral";
}

export type FrameThemeClasses = {
	/** Container border + faint fill for the whole frame. */
	container: string;
	/** Title-label color. */
	header: string;
	/** Small chip (device/kind badge). */
	badge: string;
	/** Wrapper applied to the frame BODY — greyscale in wireframe mode. */
	bodyFilter: string;
};

/**
 * Resolve frame classes for a `(theme, accent)` pair. In `wireframe` mode the
 * accent is ignored (neutral chrome + greyscale body); in `repo` mode it routes
 * through the shared {@link accentClasses} so frames match the rest of the plan.
 */
export function frameTheme(
	theme: CanvasTheme,
	accent: PlanAccent,
): FrameThemeClasses {
	if (theme === "wireframe") {
		const neutral = accentClasses("neutral");
		return {
			container: neutral.container,
			header: neutral.header,
			badge: neutral.badge,
			bodyFilter: "grayscale",
		};
	}
	const styles = accentClasses(accent);
	return {
		container: styles.container,
		header: styles.header,
		badge: styles.badge,
		bodyFilter: "",
	};
}

/** Accent border colors at full opacity — for SOLID frame surfaces, where the
 * fill is opaque `bg-card` (never translucent, so it reads correctly on any
 * theme incl. dark/Vesper) and the accent lives only in the border. */
const ACCENT_BORDER: Record<PlanAccent, string> = {
	neutral: "border-border",
	info: "border-sky-500/60",
	warning: "border-amber-500/60",
	danger: "border-red-500/60",
	success: "border-emerald-500/60",
	highlight: "border-violet-500/60",
};

/**
 * Classes for an OPAQUE frame surface: a solid `bg-card` fill plus an accent
 * border (neutral in wireframe mode). Used by frames that own a visible panel
 * (notes) so they never show the canvas through a translucent fill.
 */
export function solidSurface(theme: CanvasTheme, accent: PlanAccent): string {
	const a = theme === "wireframe" ? "neutral" : accent;
	return cn("bg-card border", ACCENT_BORDER[a]);
}
