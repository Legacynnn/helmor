import { describe, expect, it } from "vitest";
import { nextScreenshotSrc } from "./screenshot-host";

describe("nextScreenshotSrc", () => {
	it("converts a cache path to a cache-busted asset src", () => {
		const a = nextScreenshotSrc("/cache/simulator-1.png", 100);
		const b = nextScreenshotSrc("/cache/simulator-1.png", 200);
		expect(a).not.toEqual(b); // cache-busted by poll tick
		expect(a).toContain("simulator-1.png");
	});
});
