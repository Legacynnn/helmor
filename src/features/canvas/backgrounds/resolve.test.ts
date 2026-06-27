import { expect, it, vi } from "vitest";

vi.mock("./mesh.svg", () => ({ default: "mesh-url" }));
vi.mock("./aurora.svg", () => ({ default: "aurora-url" }));
vi.mock("./topography.svg", () => ({ default: "topo-url" }));
vi.mock("./dusk.svg", () => ({ default: "dusk-url" }));
vi.mock("./mist.svg", () => ({ default: "mist-url" }));

const { resolveBackgroundUrl, CANVAS_BACKGROUND_PRESETS } = await import(
	"./index"
);

it("exposes 5 presets", () => {
	expect(CANVAS_BACKGROUND_PRESETS).toHaveLength(5);
});
it("maps a preset key to its bundled asset", () => {
	expect(resolveBackgroundUrl("aurora", (p) => `file:${p}`)).toBe("aurora-url");
});
it("treats unknown values as custom file paths", () => {
	expect(resolveBackgroundUrl("/data/x.png", (p) => `file:${p}`)).toBe(
		"file:/data/x.png",
	);
});
it("returns null when unset", () => {
	expect(resolveBackgroundUrl(null, (p) => p)).toBeNull();
});
