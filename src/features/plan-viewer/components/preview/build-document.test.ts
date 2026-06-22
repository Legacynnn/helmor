import { describe, expect, it } from "vitest";
import {
	buildPreviewDocument,
	isPreviewMessage,
	PREVIEW_CDN,
} from "./build-document";

describe("buildPreviewDocument", () => {
	const doc = buildPreviewDocument("function App(){ return <div>hi</div>; }");

	it("loads the pinned CDN runtimes", () => {
		expect(doc).toContain(PREVIEW_CDN.react);
		expect(doc).toContain(PREVIEW_CDN.reactDom);
		expect(doc).toContain(PREVIEW_CDN.babel);
		expect(doc).toContain(PREVIEW_CDN.tailwind);
	});

	it("loads React before the runner script (globals must exist first)", () => {
		expect(doc.indexOf(PREVIEW_CDN.react)).toBeLessThan(
			doc.indexOf(PREVIEW_CDN.babel),
		);
		expect(doc.indexOf(PREVIEW_CDN.babel)).toBeLessThan(
			doc.indexOf("Babel.transform"),
		);
	});

	it("embeds the snippet as a JSON string and mounts an App component", () => {
		expect(doc).toContain(
			JSON.stringify("function App(){ return <div>hi</div>; }").slice(1, -1),
		);
		expect(doc).toContain("React.createElement(App)");
		expect(doc).toContain('id="root"');
	});

	it("wires error and height reporting back to the host", () => {
		// The bootstrap is embedded as a JSON string, so its quoted message types
		// appear escaped; assert on the bare identifiers that survive either way.
		expect(doc).toContain("ResizeObserver");
		expect(doc).toContain("createRoot");
		expect(doc).toContain("height");
		expect(doc).toContain("ready");
		// The runner's own catch reports an error unescaped.
		expect(doc).toContain('type: "error"');
	});
});

describe("isPreviewMessage", () => {
	it("accepts messages tagged with the preview source", () => {
		expect(isPreviewMessage({ source: "helmor-preview", type: "ready" })).toBe(
			true,
		);
	});

	it("rejects anything else", () => {
		expect(isPreviewMessage({ source: "other" })).toBe(false);
		expect(isPreviewMessage(null)).toBe(false);
		expect(isPreviewMessage("ready")).toBe(false);
	});
});
