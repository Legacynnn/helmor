import { describe, expect, it } from "vitest";
import { type BrowserCapture, serializeCaptureContext } from "./types";

function makeCapture(overrides: Partial<BrowserCapture> = {}): BrowserCapture {
	return {
		url: "https://example.com/dashboard",
		title: "Dashboard",
		viewport: { w: 1440, h: 900 },
		images: ["/tmp/cache/paste/abc/capture-1.png"],
		comments: [],
		picks: [],
		drawings: [],
		...overrides,
	};
}

describe("serializeCaptureContext", () => {
	it("renders a fenced browser-context block with url + title + viewport", () => {
		const text = serializeCaptureContext(makeCapture());
		expect(text).toContain("```browser-context");
		expect(text).toContain("url: https://example.com/dashboard");
		expect(text).toContain("title: Dashboard");
		expect(text).toContain("viewport: 1440x900");
		expect(text.endsWith("```")).toBe(true);
	});

	it("renders comments deterministically with selector + text", () => {
		const text = serializeCaptureContext(
			makeCapture({
				comments: [
					{
						id: "c1",
						text: "Fix the spacing here",
						selector: ".header > h1",
						outerHTML: "<h1>Title</h1>",
						rectCropPath: "/tmp/crop-1.png",
					},
					{
						id: "c2",
						text: "Button color is off",
						selector: "button.primary",
						outerHTML: "<button>Go</button>",
						rectCropPath: "/tmp/crop-2.png",
					},
				],
			}),
		);
		expect(text).toContain("comments: 2");
		expect(text).toContain("- .header > h1: Fix the spacing here");
		expect(text).toContain("- button.primary: Button color is off");
		// Order is deterministic.
		expect(text.indexOf(".header > h1")).toBeLessThan(
			text.indexOf("button.primary"),
		);
	});

	it("renders picks with their selectors", () => {
		const text = serializeCaptureContext(
			makeCapture({
				picks: [
					{
						selector: "div#root",
						outerHTML: "<div id=root></div>",
						computedStyles: { display: "flex" },
					},
				],
			}),
		);
		expect(text).toContain("picks: 1");
		expect(text).toContain("- div#root");
	});

	it("includes devicePreset in viewport when present", () => {
		const text = serializeCaptureContext(
			makeCapture({ viewport: { w: 390, h: 844, devicePreset: "iPhone 15" } }),
		);
		expect(text).toContain("viewport: 390x844 (iPhone 15)");
	});

	it("omits viewport when dimensions are zero", () => {
		const text = serializeCaptureContext(
			makeCapture({ viewport: { w: 0, h: 0 } }),
		);
		expect(text).not.toContain("viewport:");
	});

	it("omits title when empty", () => {
		const text = serializeCaptureContext(makeCapture({ title: "" }));
		expect(text).not.toContain("title:");
	});
});
