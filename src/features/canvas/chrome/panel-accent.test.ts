import { describe, expect, it, vi } from "vitest";

// @excalidraw/excalidraw ships a dev build that references roughjs without
// a file extension, which breaks Vite's module resolver in jsdom. Mock the
// whole package so importing panel-node (which pulls in drawing-panel) works.
vi.mock("@excalidraw/excalidraw", () => ({
	Excalidraw: () => null,
}));

import { PANEL_META } from "../panel-node";
import { accentDivider, PANEL_ACCENT } from "./panel-accent";

describe("PANEL_ACCENT", () => {
	it("defines a color for every panel type in PANEL_META", () => {
		for (const type of Object.keys(PANEL_META)) {
			expect(PANEL_ACCENT[type as keyof typeof PANEL_ACCENT]).toBeTruthy();
		}
	});

	it("accentDivider falls back to the placeholder color for unknown types", () => {
		// @ts-expect-error — intentionally passing an invalid type
		expect(accentDivider("bogus")).toBe(PANEL_ACCENT.placeholder);
	});
});
