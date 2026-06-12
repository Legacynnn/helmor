import { describe, expect, it } from "vitest";
import type { CopilotCachedModel } from "@/lib/settings";
import {
	effectiveCopilotEnabledIds,
	reconcileCopilotEnabledModelIds,
} from "./copilot-model-defaults";

const models = (slugs: string[]): CopilotCachedModel[] =>
	slugs.map((slug) => ({ slug, label: slug }));

describe("reconcileCopilotEnabledModelIds", () => {
	it("keeps null (= all enabled) across refreshes", () => {
		expect(
			reconcileCopilotEnabledModelIds(null, models(["a", "b"])),
		).toBeNull();
	});

	it("respects an explicit empty list (user cleared all)", () => {
		expect(reconcileCopilotEnabledModelIds([], models(["a", "b"]))).toEqual([]);
	});

	it("prunes picks whose slug vanished from the catalog", () => {
		expect(
			reconcileCopilotEnabledModelIds(["a", "gone"], models(["a", "b"])),
		).toEqual(["a"]);
	});

	it("keeps user picks when the catalog still contains them", () => {
		expect(reconcileCopilotEnabledModelIds(["b"], models(["a", "b"]))).toEqual([
			"b",
		]);
	});

	it("falls back to null (= all) when every prior pick went stale", () => {
		expect(
			reconcileCopilotEnabledModelIds(["old-x"], models(["a", "b"])),
		).toBeNull();
	});
});

describe("effectiveCopilotEnabledIds", () => {
	it("expands null to every cached slug", () => {
		expect(effectiveCopilotEnabledIds(null, models(["a", "b"]))).toEqual([
			"a",
			"b",
		]);
	});

	it("passes an explicit list through untouched", () => {
		expect(effectiveCopilotEnabledIds(["b"], models(["a", "b"]))).toEqual([
			"b",
		]);
	});

	it("keeps an explicit empty list empty", () => {
		expect(effectiveCopilotEnabledIds([], models(["a"]))).toEqual([]);
	});
});
