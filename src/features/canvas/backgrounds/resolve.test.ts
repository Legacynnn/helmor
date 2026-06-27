import { expect, it, vi } from "vitest";

vi.mock("./alpine-lake.webp", () => ({ default: "alpine-lake-url" }));
vi.mock("./mesh.svg", () => ({ default: "mesh-url" }));
vi.mock("./aurora.svg", () => ({ default: "aurora-url" }));
vi.mock("./topography.svg", () => ({ default: "topo-url" }));
vi.mock("./dusk.svg", () => ({ default: "dusk-url" }));
vi.mock("./mist.svg", () => ({ default: "mist-url" }));

const { resolveBackgroundUrl, CANVAS_BACKGROUND_PRESETS } = await import(
	"./index"
);

it("exposes 6 presets with the webp painting first", () => {
	expect(CANVAS_BACKGROUND_PRESETS).toHaveLength(6);
	expect(CANVAS_BACKGROUND_PRESETS[0].key).toBe("alpine-lake");
});
it("maps a preset key to its bundled asset", () => {
	expect(resolveBackgroundUrl("aurora", (p) => `file:${p}`)).toBe("aurora-url");
	expect(resolveBackgroundUrl("alpine-lake", (p) => `file:${p}`)).toBe(
		"alpine-lake-url",
	);
});
it("treats unknown values as custom file paths", () => {
	expect(resolveBackgroundUrl("/data/x.png", (p) => `file:${p}`)).toBe(
		"file:/data/x.png",
	);
});
it("returns null when unset", () => {
	expect(resolveBackgroundUrl(null, (p) => p)).toBeNull();
});
