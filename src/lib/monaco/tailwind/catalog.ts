// Curated, generated catalog of Tailwind utility classes used to feed the
// editor's completion provider. This is intentionally NOT the full Tailwind
// surface — it covers the most-used utilities plus the entire default color
// palette. Workspace-derived classes (config.ts) are merged on top at runtime.
// Extend the scales/prefixes below to widen coverage.

import { colorUtilityCss, keywordUtilityCss, scaleUtilityCss } from "./css";
import { COLOR_PREFIXES, PALETTE, SHADES, STATIC_COLORS } from "./palette";

export type TailwindClass = {
	/** The class string inserted, e.g. "bg-blue-500". */
	name: string;
	/** Raw color value when this is a color utility (resolved to hex for the
	 * swatch at provider-compile time). */
	color?: string;
	/** Short right-aligned category hint shown in the suggest widget. */
	detail?: string;
	/** Resolved CSS declaration shown on the right of the suggest row, e.g.
	 * "padding: 1rem" — the VSCode-style translation. */
	css?: string;
};

// CSS values for the static palette colors that have no numeric shade.
const STATIC_COLOR_CSS_VALUE: Record<string, string> = {
	white: "#ffffff",
	black: "#000000",
	transparent: "transparent",
	current: "currentColor",
	inherit: "inherit",
};

// Spacing scale shared by padding/margin/gap/size utilities.
const SPACING = [
	"0",
	"px",
	"0.5",
	"1",
	"1.5",
	"2",
	"2.5",
	"3",
	"3.5",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"10",
	"11",
	"12",
	"14",
	"16",
	"20",
	"24",
	"28",
	"32",
	"36",
	"40",
	"44",
	"48",
	"52",
	"56",
	"60",
	"64",
	"72",
	"80",
	"96",
];

const SPACING_PREFIXES = [
	"p",
	"px",
	"py",
	"pt",
	"pr",
	"pb",
	"pl",
	"ps",
	"pe",
	"m",
	"mx",
	"my",
	"mt",
	"mr",
	"mb",
	"ml",
	"ms",
	"me",
	"gap",
	"gap-x",
	"gap-y",
	"space-x",
	"space-y",
	"inset",
	"inset-x",
	"inset-y",
	"top",
	"right",
	"bottom",
	"left",
];

const SIZE_VALUES = [
	...SPACING,
	"auto",
	"full",
	"screen",
	"min",
	"max",
	"fit",
	"px",
	"1/2",
	"1/3",
	"2/3",
	"1/4",
	"3/4",
	"1/5",
	"2/5",
	"3/5",
	"4/5",
];

// Common keyword utilities (no scale). One entry per fully-formed class.
const KEYWORD_UTILITIES = [
	"flex",
	"inline-flex",
	"grid",
	"inline-grid",
	"block",
	"inline-block",
	"inline",
	"hidden",
	"table",
	"contents",
	"flow-root",
	"flex-row",
	"flex-row-reverse",
	"flex-col",
	"flex-col-reverse",
	"flex-wrap",
	"flex-nowrap",
	"flex-wrap-reverse",
	"flex-1",
	"flex-auto",
	"flex-initial",
	"flex-none",
	"grow",
	"grow-0",
	"shrink",
	"shrink-0",
	"items-start",
	"items-end",
	"items-center",
	"items-baseline",
	"items-stretch",
	"justify-start",
	"justify-end",
	"justify-center",
	"justify-between",
	"justify-around",
	"justify-evenly",
	"justify-stretch",
	"content-start",
	"content-end",
	"content-center",
	"content-between",
	"self-auto",
	"self-start",
	"self-end",
	"self-center",
	"self-stretch",
	"static",
	"fixed",
	"absolute",
	"relative",
	"sticky",
	"overflow-auto",
	"overflow-hidden",
	"overflow-visible",
	"overflow-scroll",
	"overflow-x-auto",
	"overflow-y-auto",
	"overflow-x-hidden",
	"overflow-y-hidden",
	"rounded",
	"rounded-none",
	"rounded-sm",
	"rounded-md",
	"rounded-lg",
	"rounded-xl",
	"rounded-2xl",
	"rounded-3xl",
	"rounded-full",
	"border",
	"border-0",
	"border-2",
	"border-4",
	"border-8",
	"border-solid",
	"border-dashed",
	"border-dotted",
	"border-none",
	"font-thin",
	"font-light",
	"font-normal",
	"font-medium",
	"font-semibold",
	"font-bold",
	"font-extrabold",
	"font-black",
	"font-sans",
	"font-serif",
	"font-mono",
	"italic",
	"not-italic",
	"underline",
	"line-through",
	"no-underline",
	"uppercase",
	"lowercase",
	"capitalize",
	"normal-case",
	"truncate",
	"text-left",
	"text-center",
	"text-right",
	"text-justify",
	"text-xs",
	"text-sm",
	"text-base",
	"text-lg",
	"text-xl",
	"text-2xl",
	"text-3xl",
	"text-4xl",
	"text-5xl",
	"text-6xl",
	"text-7xl",
	"leading-none",
	"leading-tight",
	"leading-snug",
	"leading-normal",
	"leading-relaxed",
	"leading-loose",
	"tracking-tighter",
	"tracking-tight",
	"tracking-normal",
	"tracking-wide",
	"shadow",
	"shadow-sm",
	"shadow-md",
	"shadow-lg",
	"shadow-xl",
	"shadow-2xl",
	"shadow-none",
	"shadow-inner",
	"opacity-0",
	"opacity-25",
	"opacity-50",
	"opacity-75",
	"opacity-100",
	"transition",
	"transition-all",
	"transition-colors",
	"transition-none",
	"duration-75",
	"duration-100",
	"duration-150",
	"duration-200",
	"duration-300",
	"duration-500",
	"duration-700",
	"duration-1000",
	"ease-linear",
	"ease-in",
	"ease-out",
	"ease-in-out",
	"cursor-pointer",
	"cursor-default",
	"cursor-not-allowed",
	"cursor-wait",
	"select-none",
	"select-text",
	"select-all",
	"select-auto",
	"pointer-events-none",
	"pointer-events-auto",
	"w-full",
	"h-full",
	"w-screen",
	"h-screen",
	"min-h-screen",
	"min-h-full",
];

/** Build the full set of color utilities from the default palette. */
export function buildColorUtilities(): TailwindClass[] {
	const out: TailwindClass[] = [];
	for (const prefix of COLOR_PREFIXES) {
		for (const [family, hexes] of Object.entries(PALETTE)) {
			SHADES.forEach((shade, index) => {
				out.push({
					name: `${prefix}-${family}-${shade}`,
					color: hexes[index],
					detail: "color",
					css: colorUtilityCss(prefix, hexes[index]),
				});
			});
		}
		for (const [name, hex] of Object.entries(STATIC_COLORS)) {
			out.push({
				name: `${prefix}-${name}`,
				color: hex,
				detail: "color",
				css: colorUtilityCss(prefix, STATIC_COLOR_CSS_VALUE[name]),
			});
		}
	}
	return out;
}

/** Build spacing/sizing utilities from the spacing + size scales. */
function buildScaleUtilities(): TailwindClass[] {
	const out: TailwindClass[] = [];
	for (const prefix of SPACING_PREFIXES) {
		for (const value of SPACING) {
			out.push({
				name: `${prefix}-${value}`,
				detail: "spacing",
				css: scaleUtilityCss(prefix, value),
			});
		}
	}
	for (const prefix of ["w", "h", "min-w", "max-w", "min-h", "max-h", "size"]) {
		for (const value of SIZE_VALUES) {
			out.push({
				name: `${prefix}-${value}`,
				detail: "sizing",
				css: scaleUtilityCss(prefix, value),
			});
		}
	}
	return out;
}

let staticCatalogCache: TailwindClass[] | null = null;

/** Memoized static catalog: keyword utilities + scales + color palette. */
export function buildStaticCatalog(): TailwindClass[] {
	if (staticCatalogCache) return staticCatalogCache;
	const keywords: TailwindClass[] = KEYWORD_UTILITIES.map((name) => ({
		name,
		detail: "utility",
		css: keywordUtilityCss(name),
	}));
	staticCatalogCache = dedupeByName([
		...keywords,
		...buildScaleUtilities(),
		...buildColorUtilities(),
	]);
	return staticCatalogCache;
}

/** Merge catalogs, with later entries (workspace-derived) winning on name. */
export function mergeCatalogs(
	base: TailwindClass[],
	overrides: TailwindClass[],
): TailwindClass[] {
	return dedupeByName([...base, ...overrides]);
}

function dedupeByName(items: TailwindClass[]): TailwindClass[] {
	const map = new Map<string, TailwindClass>();
	for (const item of items) {
		map.set(item.name, item);
	}
	return [...map.values()];
}
