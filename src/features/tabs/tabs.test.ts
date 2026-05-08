import { beforeEach, describe, expect, it } from "vitest";

import { createWorkspaceTabsStore } from "./store";

describe("workspace tabs store", () => {
	let store: ReturnType<typeof createWorkspaceTabsStore>;
	beforeEach(() => {
		store = createWorkspaceTabsStore();
	});

	it("returns empty list for unknown workspace", () => {
		expect(store.getTabs("ws-1")).toEqual([]);
	});

	it("opens a file tab and returns its id", () => {
		const id = store.openFileTab("ws-1", {
			absolutePath: "/root/src/a.ts",
			relativePath: "src/a.ts",
			fileName: "a.ts",
			opener: { kind: "browser" },
		});
		expect(id).toMatchObject({ kind: "file", absolutePath: "/root/src/a.ts" });
		expect(store.getTabs("ws-1")).toHaveLength(1);
	});

	it("dedupes file tabs by absolute path within workspace", () => {
		const a = store.openFileTab("ws-1", {
			absolutePath: "/root/a.ts",
			relativePath: "a.ts",
			fileName: "a.ts",
			opener: { kind: "browser" },
		});
		const b = store.openFileTab("ws-1", {
			absolutePath: "/root/a.ts",
			relativePath: "a.ts",
			fileName: "a.ts",
			opener: { kind: "browser" },
		});
		expect(a).toEqual(b);
		expect(store.getTabs("ws-1")).toHaveLength(1);
	});

	it("keeps file-tab lists isolated per workspace", () => {
		store.openFileTab("ws-1", {
			absolutePath: "/root/a.ts",
			relativePath: "a.ts",
			fileName: "a.ts",
			opener: { kind: "browser" },
		});
		store.openFileTab("ws-2", {
			absolutePath: "/root/b.ts",
			relativePath: "b.ts",
			fileName: "b.ts",
			opener: { kind: "browser" },
		});
		expect(store.getTabs("ws-1")).toHaveLength(1);
		expect(store.getTabs("ws-2")).toHaveLength(1);
	});

	it("closes a tab by id", () => {
		const id = store.openFileTab("ws-1", {
			absolutePath: "/root/a.ts",
			relativePath: "a.ts",
			fileName: "a.ts",
			opener: { kind: "browser" },
		});
		store.closeFileTab("ws-1", id);
		expect(store.getTabs("ws-1")).toHaveLength(0);
	});

	it("updates opener context when reopening from a different source", () => {
		const id = store.openFileTab("ws-1", {
			absolutePath: "/root/a.ts",
			relativePath: "a.ts",
			fileName: "a.ts",
			opener: { kind: "browser" },
		});
		store.openFileTab("ws-1", {
			absolutePath: "/root/a.ts",
			relativePath: "a.ts",
			fileName: "a.ts",
			opener: { kind: "changes", side: "unstaged" },
		});
		const tab = store.getTabs("ws-1")[0];
		expect(tab.absolutePath).toBe(id.absolutePath);
		expect(tab.opener).toEqual({ kind: "changes", side: "unstaged" });
	});

	it("tracks dirty state per tab", () => {
		const id = store.openFileTab("ws-1", {
			absolutePath: "/root/a.ts",
			relativePath: "a.ts",
			fileName: "a.ts",
			opener: { kind: "browser" },
		});
		store.setDirty("ws-1", id, true);
		expect(store.getTabs("ws-1")[0].dirty).toBe(true);
		store.setDirty("ws-1", id, false);
		expect(store.getTabs("ws-1")[0].dirty).toBe(false);
	});

	it("listAllDirty returns dirty tabs across workspaces", () => {
		const a = store.openFileTab("ws-1", {
			absolutePath: "/root/a.ts",
			relativePath: "a.ts",
			fileName: "a.ts",
			opener: { kind: "browser" },
		});
		const b = store.openFileTab("ws-2", {
			absolutePath: "/root/b.ts",
			relativePath: "b.ts",
			fileName: "b.ts",
			opener: { kind: "browser" },
		});
		store.setDirty("ws-1", a, true);
		store.setDirty("ws-2", b, true);
		expect(store.listAllDirty()).toHaveLength(2);
	});
});
