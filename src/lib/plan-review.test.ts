import { describe, expect, it } from "vitest";
import type { ThreadMessageLike } from "./api";
import {
	hasUnresolvedPlanReview,
	isMdxPlanPath,
	latestMdxPlanSlug,
	planSlugFromPath,
} from "./plan-review";

function msg(
	role: "assistant" | "user",
	parts: { type: string }[] = [{ type: "text" }],
): ThreadMessageLike {
	return {
		role,
		content: parts.map((p) => ({ ...p, text: "x" }) as never),
	};
}

function planMsg(): ThreadMessageLike {
	return msg("assistant", [
		{
			type: "plan-review",
		},
	]);
}

describe("hasUnresolvedPlanReview", () => {
	it("returns false for empty messages", () => {
		expect(hasUnresolvedPlanReview([])).toBe(false);
	});

	it("returns false when no plan-review exists", () => {
		expect(hasUnresolvedPlanReview([msg("user"), msg("assistant")])).toBe(
			false,
		);
	});

	it("returns true when last plan-review has no user message after it", () => {
		expect(hasUnresolvedPlanReview([msg("user"), planMsg()])).toBe(true);
	});

	it("returns false when a user message follows the plan-review", () => {
		expect(hasUnresolvedPlanReview([msg("user"), planMsg(), msg("user")])).toBe(
			false,
		);
	});

	it("returns true for the latest unresolved plan-review among multiple", () => {
		expect(
			hasUnresolvedPlanReview([
				planMsg(),
				msg("user"),
				msg("assistant"),
				planMsg(),
			]),
		).toBe(true);
	});

	it("returns false when all plan-reviews are resolved", () => {
		expect(
			hasUnresolvedPlanReview([planMsg(), msg("user"), planMsg(), msg("user")]),
		).toBe(false);
	});

	it("returns true when plan-review is the only message", () => {
		expect(hasUnresolvedPlanReview([planMsg()])).toBe(true);
	});

	it("ignores assistant messages after plan-review (only user resolves)", () => {
		expect(hasUnresolvedPlanReview([planMsg(), msg("assistant")])).toBe(true);
	});
});

describe("isMdxPlanPath / planSlugFromPath", () => {
	it("matches a relative .helmor/plans/<slug>.mdx path", () => {
		expect(isMdxPlanPath(".helmor/plans/foo.mdx")).toBe(true);
		expect(planSlugFromPath(".helmor/plans/foo.mdx")).toBe("foo");
	});

	it("matches an absolute .helmor/plans/<slug>.mdx path", () => {
		expect(isMdxPlanPath("/repo/.helmor/plans/my-plan.mdx")).toBe(true);
		expect(planSlugFromPath("/repo/.helmor/plans/my-plan.mdx")).toBe("my-plan");
	});

	it("rejects non-plan paths", () => {
		expect(isMdxPlanPath("src/foo.mdx")).toBe(false);
		expect(planSlugFromPath("src/foo.mdx")).toBeNull();
		expect(isMdxPlanPath(".helmor/plans/foo.md")).toBe(false);
		expect(planSlugFromPath(".helmor/plans/foo.md")).toBeNull();
		expect(isMdxPlanPath(".helmor/notplans/foo.mdx")).toBe(false);
		expect(planSlugFromPath(".helmor/plans/sub/foo.mdx")).toBeNull();
	});

	it("returns false / null for empty or nullish input", () => {
		expect(isMdxPlanPath(undefined)).toBe(false);
		expect(isMdxPlanPath(null)).toBe(false);
		expect(isMdxPlanPath("")).toBe(false);
		expect(planSlugFromPath(undefined)).toBeNull();
		expect(planSlugFromPath(null)).toBeNull();
	});
});

describe("latestMdxPlanSlug", () => {
	const planMsg = (path: string): ThreadMessageLike => ({
		role: "assistant",
		content: [{ type: "plan-review", planFilePath: path } as never],
	});
	const userMsg = (): ThreadMessageLike => ({
		role: "user",
		content: [{ type: "text", text: "ok" } as never],
	});

	it("returns the latest plan-review slug even when a user message follows", () => {
		const messages = [planMsg(".helmor/plans/alpha.mdx"), userMsg()];
		expect(latestMdxPlanSlug(messages)).toBe("alpha");
	});

	it("returns the most recent of multiple plans", () => {
		const messages = [
			planMsg(".helmor/plans/alpha.mdx"),
			planMsg(".helmor/plans/beta.mdx"),
		];
		expect(latestMdxPlanSlug(messages)).toBe("beta");
	});

	it("returns null when there is no plan-review", () => {
		expect(latestMdxPlanSlug([userMsg()])).toBeNull();
	});

	it("returns null when the latest plan-review path is not an MDX plan", () => {
		expect(latestMdxPlanSlug([planMsg("/tmp/notes.txt")])).toBeNull();
	});
});
