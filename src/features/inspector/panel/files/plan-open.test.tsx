import { describe, expect, it } from "vitest";
import { isMdxPlanPath, planSlugFromPath } from "@/lib/plan-review";

// Pins the routing decision the file-tree handler encodes: a plan path + a
// session id routes to the plan view; otherwise the editor open path runs.
// (The helpers themselves are unit-tested in plan-review.test.ts.)
describe("file-tree plan routing decision", () => {
	function route(absolutePath: string, sessionId: string | null) {
		if (sessionId && isMdxPlanPath(absolutePath)) {
			const slug = planSlugFromPath(absolutePath);
			if (slug) return { kind: "plan" as const, slug, sessionId };
		}
		return { kind: "editor" as const };
	}

	it("routes a plan path with a session to the plan view", () => {
		expect(route("/repo/.helmor/plans/foo.mdx", "s1")).toEqual({
			kind: "plan",
			slug: "foo",
			sessionId: "s1",
		});
	});
	it("falls back to editor when there is no session", () => {
		expect(route("/repo/.helmor/plans/foo.mdx", null)).toEqual({
			kind: "editor",
		});
	});
	it("falls back to editor for a non-plan file", () => {
		expect(route("/repo/src/main.ts", "s1")).toEqual({ kind: "editor" });
	});
});
