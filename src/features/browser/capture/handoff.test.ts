import { describe, expect, it, vi } from "vitest";
import type { ComposerInsertRequest } from "@/lib/composer-insert";
import {
	buildCaptureInsertItems,
	captureSummary,
	sendCaptureToActiveAgent,
} from "./handoff";
import type { BrowserCapture } from "./types";

function makeCapture(overrides: Partial<BrowserCapture> = {}): BrowserCapture {
	return {
		url: "https://localhost:5173/dashboard",
		title: "Dashboard",
		viewport: { w: 1440, h: 900 },
		images: ["/tmp/cache/paste/abc/capture-1.png"],
		comments: [],
		picks: [],
		drawings: [],
		...overrides,
	};
}

describe("captureSummary", () => {
	it("derives a label from the URL hostname", () => {
		expect(captureSummary(makeCapture())).toContain("localhost:5173");
	});

	it("includes a comment count when comments exist", () => {
		const capture = makeCapture({
			comments: [
				{
					id: "c1",
					text: "fix this",
					selector: ".btn",
					outerHTML: "<button/>",
					rectCropPath: "/tmp/crop.png",
				},
			],
		});
		expect(captureSummary(capture)).toContain("1 comment");
	});

	it("pluralizes multiple comments", () => {
		const comment = {
			id: "c",
			text: "x",
			selector: "a",
			outerHTML: "<a/>",
			rectCropPath: "/tmp/c.png",
		};
		const capture = makeCapture({
			comments: [comment, { ...comment, id: "c2" }],
		});
		expect(captureSummary(capture)).toContain("2 comments");
	});
});

describe("buildCaptureInsertItems", () => {
	it("produces a browser-capture badge with the first image path", () => {
		const items = buildCaptureInsertItems(makeCapture());
		const badge = items.find((item) => item.kind === "browser-capture");
		expect(badge).toBeDefined();
		if (badge?.kind === "browser-capture") {
			expect(badge.capturePath).toBe("/tmp/cache/paste/abc/capture-1.png");
			expect(badge.summary).toContain("localhost:5173");
		}
	});

	it("appends a text item with the serialized context block", () => {
		const items = buildCaptureInsertItems(makeCapture());
		const text = items.find((item) => item.kind === "text");
		expect(text).toBeDefined();
		if (text?.kind === "text") {
			expect(text.text).toContain("```browser-context");
			expect(text.text).toContain("url: https://localhost:5173/dashboard");
		}
	});

	it("omits the badge item when there is no image", () => {
		const items = buildCaptureInsertItems(makeCapture({ images: [] }));
		expect(items.some((item) => item.kind === "browser-capture")).toBe(false);
	});
});

describe("sendCaptureToActiveAgent", () => {
	it("calls enqueue with the built items and append behavior", () => {
		const enqueue = vi.fn<(request: ComposerInsertRequest) => void>();
		sendCaptureToActiveAgent(makeCapture(), enqueue);
		expect(enqueue).toHaveBeenCalledOnce();
		const request = enqueue.mock.calls[0][0];
		expect(request.behavior).toBe("append");
		expect(request.items.some((item) => item.kind === "browser-capture")).toBe(
			true,
		);
		expect(request.items.some((item) => item.kind === "text")).toBe(true);
	});
});
