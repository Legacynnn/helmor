import alpineLake from "./alpine-lake.webp";
import aurora from "./aurora.svg";
import dusk from "./dusk.svg";
import mesh from "./mesh.svg";
import mist from "./mist.svg";
import topography from "./topography.svg";

export type CanvasBackgroundPreset = {
	key: string;
	label: string;
	url: string;
};

export const CANVAS_BACKGROUND_PRESETS: CanvasBackgroundPreset[] = [
	{ key: "alpine-lake", label: "Alpine Lake", url: alpineLake },
	{ key: "mesh", label: "Mesh", url: mesh },
	{ key: "aurora", label: "Aurora", url: aurora },
	{ key: "topography", label: "Topography", url: topography },
	{ key: "dusk", label: "Dusk", url: dusk },
	{ key: "mist", label: "Mist", url: mist },
];

const BY_KEY = new Map(CANVAS_BACKGROUND_PRESETS.map((p) => [p.key, p]));

/** Resolve a stored `backgroundImage` value to a usable URL. A known preset key
 * maps to its bundled asset; any other non-empty value is treated as a custom
 * file path served via the asset protocol. Returns null when unset. */
export function resolveBackgroundUrl(
	value: string | null | undefined,
	convertFileSrc: (p: string) => string,
): string | null {
	if (!value) return null;
	const preset = BY_KEY.get(value);
	if (preset) return preset.url;
	return convertFileSrc(value);
}
