import { describe, expect, it } from "vitest";
import type { EditorSessionState } from "@/lib/editor-session";
import { type EditorFileTab, openInTabs, pinTab } from "./tab-model";

function session(
	path: string,
	patch: Partial<EditorSessionState> = {},
): EditorSessionState {
	return { kind: "diff", path, fileStatus: "M", ...patch };
}

function ids(tabs: EditorFileTab[]): string[] {
	return tabs.map((tab) => tab.id);
}

describe("openInTabs", () => {
	it("appends pinned opens", () => {
		let tabs = openInTabs([], session("/ws/a.ts"));
		tabs = openInTabs(tabs, session("/ws/b.ts"));
		expect(ids(tabs)).toEqual(["/ws/a.ts", "/ws/b.ts"]);
		expect(tabs.every((tab) => !tab.preview)).toBe(true);
	});

	it("replaces the single preview tab in place", () => {
		let tabs = openInTabs([], session("/ws/a.ts"));
		tabs = openInTabs(tabs, session("/ws/b.ts", { preview: true }));
		expect(ids(tabs)).toEqual(["/ws/a.ts", "/ws/b.ts"]);

		tabs = openInTabs(tabs, session("/ws/c.ts", { preview: true }));
		expect(ids(tabs)).toEqual(["/ws/a.ts", "/ws/c.ts"]);
		expect(tabs[1].preview).toBe(true);
	});

	it("pins the preview tab when reopened non-preview", () => {
		let tabs = openInTabs([], session("/ws/a.ts", { preview: true }));
		expect(tabs[0].preview).toBe(true);

		tabs = openInTabs(tabs, session("/ws/a.ts"));
		expect(tabs[0].preview).toBe(false);

		// A later preview open now appends instead of replacing it.
		tabs = openInTabs(tabs, session("/ws/b.ts", { preview: true }));
		expect(ids(tabs)).toEqual(["/ws/a.ts", "/ws/b.ts"]);
	});

	it("never keeps a dirty session in the preview slot", () => {
		let tabs = openInTabs([], session("/ws/a.ts", { preview: true }));
		tabs = openInTabs(
			tabs,
			session("/ws/a.ts", { preview: true, dirty: true, kind: "file" }),
		);
		expect(tabs[0].preview).toBe(false);
	});

	it("does not pin an existing pinned tab back to preview", () => {
		let tabs = openInTabs([], session("/ws/a.ts"));
		tabs = openInTabs(tabs, session("/ws/a.ts", { preview: true }));
		expect(tabs[0].preview).toBe(false);
	});

	it("updates a preview tab session without losing preview status", () => {
		let tabs = openInTabs([], session("/ws/a.ts", { preview: true }));
		tabs = openInTabs(
			tabs,
			session("/ws/a.ts", { preview: true, originalText: "x" }),
		);
		expect(tabs[0].preview).toBe(true);
		expect(tabs[0].session.originalText).toBe("x");
	});
});

describe("pinTab", () => {
	it("pins by id", () => {
		let tabs = openInTabs([], session("/ws/a.ts", { preview: true }));
		tabs = pinTab(tabs, "/ws/a.ts");
		expect(tabs[0].preview).toBe(false);
	});
});
