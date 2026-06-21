import { describe, expect, it } from "vitest";
import { isMdxPlanPath, planSlugFromPath } from "@/lib/plan-review";

// Pins the routing decision the file-tree handler encodes: ANY Helmor plan path
// routes to the plan view (the session id is only an optional hint — the
// conversation panel resolves the session itself); every other file opens in
// the editor. (The helpers are unit-tested in plan-review.test.ts.)
describe("file-tree plan routing decision", () => {
	function route(absolutePath: string, sessionId: string | null) {
		if (isMdxPlanPath(absolutePath)) {
			const slug = planSlugFromPath(absolutePath);
			if (slug) {
				return {
					kind: "plan" as const,
					slug,
					sessionId: sessionId ?? undefined,
				};
			}
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
	it("still routes a plan path to the plan view when no session is known", () => {
		expect(route("/repo/.helmor/plans/foo.mdx", null)).toEqual({
			kind: "plan",
			slug: "foo",
			sessionId: undefined,
		});
	});
	it("falls back to editor for a non-plan file", () => {
		expect(route("/repo/src/main.ts", "s1")).toEqual({ kind: "editor" });
	});
});
