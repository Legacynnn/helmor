// Derives the resolved CSS declaration for a Tailwind utility class, so the
// completion provider can show it on the right of each suggest row (and in the
// expandable details panel) — the way VSCode's Tailwind IntelliSense does.
//
// This intentionally mirrors the curated catalog: it knows how to translate the
// generated scale/color utilities and the hand-listed keyword utilities. It is
// NOT a full Tailwind engine — anything it can't resolve simply yields
// `undefined`, and the provider falls back to the category hint.

// ── Colors ──────────────────────────────────────────────────────────────────

// Maps a color utility prefix to the CSS property it sets. Mirrors
// COLOR_PREFIXES in palette.ts.
const COLOR_PROPERTY: Record<string, string> = {
	bg: "background-color",
	text: "color",
	border: "border-color",
	ring: "--tw-ring-color",
	"ring-offset": "--tw-ring-offset-color",
	divide: "border-color",
	outline: "outline-color",
	decoration: "text-decoration-color",
	accent: "accent-color",
	caret: "caret-color",
	fill: "fill",
	stroke: "stroke",
	shadow: "--tw-shadow-color",
	from: "--tw-gradient-from",
	via: "--tw-gradient-via",
	to: "--tw-gradient-to",
};

/** `bg-blue-500` → `background-color: #3b82f6`. `value` is the resolved CSS
 * color (hex / oklch / keyword like `currentColor`). */
export function colorUtilityCss(
	prefix: string,
	value: string | undefined,
): string | undefined {
	const property = COLOR_PROPERTY[prefix];
	if (!property || !value) return undefined;
	return `${property}: ${value}`;
}

// ── Spacing / sizing scales ──────────────────────────────────────────────────

const FRACTIONS: Record<string, string> = {
	"1/2": "50%",
	"1/3": "33.333333%",
	"2/3": "66.666667%",
	"1/4": "25%",
	"2/4": "50%",
	"3/4": "75%",
	"1/5": "20%",
	"2/5": "40%",
	"3/5": "60%",
	"4/5": "80%",
};

/** Resolve a Tailwind spacing/sizing scale value to a CSS length. `axis` picks
 * the viewport unit for `screen` (x → vw, y → vh). */
function lengthValue(
	value: string,
	axis: "x" | "y" | null,
): string | undefined {
	if (value in FRACTIONS) return FRACTIONS[value];
	switch (value) {
		case "0":
			return "0px";
		case "px":
			return "1px";
		case "auto":
			return "auto";
		case "full":
			return "100%";
		case "min":
			return "min-content";
		case "max":
			return "max-content";
		case "fit":
			return "fit-content";
		case "screen":
			return axis === "y" ? "100vh" : "100vw";
	}
	const numeric = Number(value);
	if (value !== "" && !Number.isNaN(numeric)) {
		// Tailwind's spacing scale: 1 unit = 0.25rem. toFixed trims float noise
		// (0.25 * 1.5 = 0.375), and the unary + drops trailing zeros.
		return `${+(numeric * 0.25).toFixed(4)}rem`;
	}
	return undefined;
}

type ScaleTarget = { props: string[]; axis: "x" | "y" | null };

// Maps a scale utility prefix to its CSS properties + viewport axis. Mirrors
// SPACING_PREFIXES and the sizing prefixes in catalog.ts.
const SCALE_PROPERTY: Record<string, ScaleTarget> = {
	p: { props: ["padding"], axis: null },
	px: { props: ["padding-left", "padding-right"], axis: "x" },
	py: { props: ["padding-top", "padding-bottom"], axis: "y" },
	pt: { props: ["padding-top"], axis: "y" },
	pr: { props: ["padding-right"], axis: "x" },
	pb: { props: ["padding-bottom"], axis: "y" },
	pl: { props: ["padding-left"], axis: "x" },
	ps: { props: ["padding-inline-start"], axis: "x" },
	pe: { props: ["padding-inline-end"], axis: "x" },
	m: { props: ["margin"], axis: null },
	mx: { props: ["margin-left", "margin-right"], axis: "x" },
	my: { props: ["margin-top", "margin-bottom"], axis: "y" },
	mt: { props: ["margin-top"], axis: "y" },
	mr: { props: ["margin-right"], axis: "x" },
	mb: { props: ["margin-bottom"], axis: "y" },
	ml: { props: ["margin-left"], axis: "x" },
	ms: { props: ["margin-inline-start"], axis: "x" },
	me: { props: ["margin-inline-end"], axis: "x" },
	gap: { props: ["gap"], axis: null },
	"gap-x": { props: ["column-gap"], axis: "x" },
	"gap-y": { props: ["row-gap"], axis: "y" },
	// space-* applies a margin to non-first children; shown simplified.
	"space-x": { props: ["margin-left"], axis: "x" },
	"space-y": { props: ["margin-top"], axis: "y" },
	inset: { props: ["inset"], axis: null },
	"inset-x": { props: ["left", "right"], axis: "x" },
	"inset-y": { props: ["top", "bottom"], axis: "y" },
	top: { props: ["top"], axis: "y" },
	right: { props: ["right"], axis: "x" },
	bottom: { props: ["bottom"], axis: "y" },
	left: { props: ["left"], axis: "x" },
	w: { props: ["width"], axis: "x" },
	h: { props: ["height"], axis: "y" },
	"min-w": { props: ["min-width"], axis: "x" },
	"max-w": { props: ["max-width"], axis: "x" },
	"min-h": { props: ["min-height"], axis: "y" },
	"max-h": { props: ["max-height"], axis: "y" },
	size: { props: ["width", "height"], axis: null },
};

/** `p-4` → `padding: 1rem`; `px-2` → `padding-left: 0.5rem; padding-right: 0.5rem`. */
export function scaleUtilityCss(
	prefix: string,
	value: string,
): string | undefined {
	const target = SCALE_PROPERTY[prefix];
	if (!target) return undefined;
	const length = lengthValue(value, target.axis);
	if (length === undefined) return undefined;
	return target.props.map((prop) => `${prop}: ${length}`).join("; ");
}

// ── Keyword utilities ────────────────────────────────────────────────────────

// Exact-name → CSS for the hand-listed keyword utilities in catalog.ts.
export const KEYWORD_CSS: Record<string, string> = {
	// display
	flex: "display: flex",
	"inline-flex": "display: inline-flex",
	grid: "display: grid",
	"inline-grid": "display: inline-grid",
	block: "display: block",
	"inline-block": "display: inline-block",
	inline: "display: inline",
	hidden: "display: none",
	table: "display: table",
	contents: "display: contents",
	"flow-root": "display: flow-root",
	// flex
	"flex-row": "flex-direction: row",
	"flex-row-reverse": "flex-direction: row-reverse",
	"flex-col": "flex-direction: column",
	"flex-col-reverse": "flex-direction: column-reverse",
	"flex-wrap": "flex-wrap: wrap",
	"flex-nowrap": "flex-wrap: nowrap",
	"flex-wrap-reverse": "flex-wrap: wrap-reverse",
	"flex-1": "flex: 1 1 0%",
	"flex-auto": "flex: 1 1 auto",
	"flex-initial": "flex: 0 1 auto",
	"flex-none": "flex: none",
	grow: "flex-grow: 1",
	"grow-0": "flex-grow: 0",
	shrink: "flex-shrink: 1",
	"shrink-0": "flex-shrink: 0",
	// align / justify
	"items-start": "align-items: flex-start",
	"items-end": "align-items: flex-end",
	"items-center": "align-items: center",
	"items-baseline": "align-items: baseline",
	"items-stretch": "align-items: stretch",
	"justify-start": "justify-content: flex-start",
	"justify-end": "justify-content: flex-end",
	"justify-center": "justify-content: center",
	"justify-between": "justify-content: space-between",
	"justify-around": "justify-content: space-around",
	"justify-evenly": "justify-content: space-evenly",
	"justify-stretch": "justify-content: stretch",
	"content-start": "align-content: flex-start",
	"content-end": "align-content: flex-end",
	"content-center": "align-content: center",
	"content-between": "align-content: space-between",
	"self-auto": "align-self: auto",
	"self-start": "align-self: flex-start",
	"self-end": "align-self: flex-end",
	"self-center": "align-self: center",
	"self-stretch": "align-self: stretch",
	// position
	static: "position: static",
	fixed: "position: fixed",
	absolute: "position: absolute",
	relative: "position: relative",
	sticky: "position: sticky",
	// overflow
	"overflow-auto": "overflow: auto",
	"overflow-hidden": "overflow: hidden",
	"overflow-visible": "overflow: visible",
	"overflow-scroll": "overflow: scroll",
	"overflow-x-auto": "overflow-x: auto",
	"overflow-y-auto": "overflow-y: auto",
	"overflow-x-hidden": "overflow-x: hidden",
	"overflow-y-hidden": "overflow-y: hidden",
	// border radius
	rounded: "border-radius: 0.25rem",
	"rounded-none": "border-radius: 0px",
	"rounded-sm": "border-radius: 0.125rem",
	"rounded-md": "border-radius: 0.375rem",
	"rounded-lg": "border-radius: 0.5rem",
	"rounded-xl": "border-radius: 0.75rem",
	"rounded-2xl": "border-radius: 1rem",
	"rounded-3xl": "border-radius: 1.5rem",
	"rounded-full": "border-radius: 9999px",
	// border width / style
	border: "border-width: 1px",
	"border-0": "border-width: 0px",
	"border-2": "border-width: 2px",
	"border-4": "border-width: 4px",
	"border-8": "border-width: 8px",
	"border-solid": "border-style: solid",
	"border-dashed": "border-style: dashed",
	"border-dotted": "border-style: dotted",
	"border-none": "border-style: none",
	// font weight / family
	"font-thin": "font-weight: 100",
	"font-light": "font-weight: 300",
	"font-normal": "font-weight: 400",
	"font-medium": "font-weight: 500",
	"font-semibold": "font-weight: 600",
	"font-bold": "font-weight: 700",
	"font-extrabold": "font-weight: 800",
	"font-black": "font-weight: 900",
	"font-sans": "font-family: ui-sans-serif, system-ui, sans-serif",
	"font-serif": "font-family: ui-serif, Georgia, serif",
	"font-mono": "font-family: ui-monospace, monospace",
	// font style / decoration / transform
	italic: "font-style: italic",
	"not-italic": "font-style: normal",
	underline: "text-decoration-line: underline",
	"line-through": "text-decoration-line: line-through",
	"no-underline": "text-decoration-line: none",
	uppercase: "text-transform: uppercase",
	lowercase: "text-transform: lowercase",
	capitalize: "text-transform: capitalize",
	"normal-case": "text-transform: none",
	truncate: "overflow: hidden; text-overflow: ellipsis; white-space: nowrap",
	// text align
	"text-left": "text-align: left",
	"text-center": "text-align: center",
	"text-right": "text-align: right",
	"text-justify": "text-align: justify",
	// font size
	"text-xs": "font-size: 0.75rem; line-height: 1rem",
	"text-sm": "font-size: 0.875rem; line-height: 1.25rem",
	"text-base": "font-size: 1rem; line-height: 1.5rem",
	"text-lg": "font-size: 1.125rem; line-height: 1.75rem",
	"text-xl": "font-size: 1.25rem; line-height: 1.75rem",
	"text-2xl": "font-size: 1.5rem; line-height: 2rem",
	"text-3xl": "font-size: 1.875rem; line-height: 2.25rem",
	"text-4xl": "font-size: 2.25rem; line-height: 2.5rem",
	"text-5xl": "font-size: 3rem; line-height: 1",
	"text-6xl": "font-size: 3.75rem; line-height: 1",
	"text-7xl": "font-size: 4.5rem; line-height: 1",
	// line height
	"leading-none": "line-height: 1",
	"leading-tight": "line-height: 1.25",
	"leading-snug": "line-height: 1.375",
	"leading-normal": "line-height: 1.5",
	"leading-relaxed": "line-height: 1.625",
	"leading-loose": "line-height: 2",
	// letter spacing
	"tracking-tighter": "letter-spacing: -0.05em",
	"tracking-tight": "letter-spacing: -0.025em",
	"tracking-normal": "letter-spacing: 0em",
	"tracking-wide": "letter-spacing: 0.025em",
	// box shadow
	shadow:
		"box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
	"shadow-sm": "box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)",
	"shadow-md":
		"box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
	"shadow-lg":
		"box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
	"shadow-xl":
		"box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
	"shadow-2xl": "box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25)",
	"shadow-none": "box-shadow: 0 0 #0000",
	"shadow-inner": "box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
	// opacity
	"opacity-0": "opacity: 0",
	"opacity-25": "opacity: 0.25",
	"opacity-50": "opacity: 0.5",
	"opacity-75": "opacity: 0.75",
	"opacity-100": "opacity: 1",
	// transition
	transition:
		"transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter; transition-duration: 150ms",
	"transition-all": "transition-property: all; transition-duration: 150ms",
	"transition-colors":
		"transition-property: color, background-color, border-color, text-decoration-color, fill, stroke; transition-duration: 150ms",
	"transition-none": "transition-property: none",
	"duration-75": "transition-duration: 75ms",
	"duration-100": "transition-duration: 100ms",
	"duration-150": "transition-duration: 150ms",
	"duration-200": "transition-duration: 200ms",
	"duration-300": "transition-duration: 300ms",
	"duration-500": "transition-duration: 500ms",
	"duration-700": "transition-duration: 700ms",
	"duration-1000": "transition-duration: 1000ms",
	"ease-linear": "transition-timing-function: linear",
	"ease-in": "transition-timing-function: cubic-bezier(0.4, 0, 1, 1)",
	"ease-out": "transition-timing-function: cubic-bezier(0, 0, 0.2, 1)",
	"ease-in-out": "transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)",
	// interactivity
	"cursor-pointer": "cursor: pointer",
	"cursor-default": "cursor: default",
	"cursor-not-allowed": "cursor: not-allowed",
	"cursor-wait": "cursor: wait",
	"select-none": "user-select: none",
	"select-text": "user-select: text",
	"select-all": "user-select: all",
	"select-auto": "user-select: auto",
	"pointer-events-none": "pointer-events: none",
	"pointer-events-auto": "pointer-events: auto",
	// sizing keywords (scale generation wins on dedupe, listed for completeness)
	"w-full": "width: 100%",
	"h-full": "height: 100%",
	"w-screen": "width: 100vw",
	"h-screen": "height: 100vh",
	"min-h-screen": "min-height: 100vh",
	"min-h-full": "min-height: 100%",
};

/** Look up the CSS for a keyword utility (exact name). */
export function keywordUtilityCss(name: string): string | undefined {
	return KEYWORD_CSS[name];
}
