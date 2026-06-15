import { describe, expect, it } from "vitest";
import type { InspectorFileItem } from "@/lib/editor-session";
import { buildEditedPaths, buildFileTree } from "./use-file-tree";

function changeItem(
	path: string,
	patch: Partial<InspectorFileItem> = {},
): InspectorFileItem {
	const name = path.split("/").pop() ?? path;
	return {
		path,
		absolutePath: `/ws/${path}`,
		name,
		status: "M",
		stagedInsertions: 0,
		stagedDeletions: 0,
		unstagedInsertions: 1,
		unstagedDeletions: 0,
		committedInsertions: 0,
		committedDeletions: 0,
		unstagedStatus: "M",
		...patch,
	} as InspectorFileItem;
}

describe("buildFileTree", () => {
	it("nests flat entries and sorts directories first", () => {
		const roots = buildFileTree([
			{ path: "README.md", name: "README.md", isDir: false, ignored: false },
			{ path: "src", name: "src", isDir: true, ignored: false },
			{ path: "src/app.ts", name: "app.ts", isDir: false, ignored: false },
			{
				path: "src/components",
				name: "components",
				isDir: true,
				ignored: false,
			},
			{
				path: "src/components/button.tsx",
				name: "button.tsx",
				isDir: false,
				ignored: false,
			},
		]);

		expect(roots.map((node) => node.name)).toEqual(["src", "README.md"]);
		const src = roots[0];
		expect(src.children.map((node) => node.name)).toEqual([
			"components",
			"app.ts",
		]);
		expect(src.children[0].children[0].path).toBe("src/components/button.tsx");
	});

	it("keeps orphaned children as roots instead of dropping them", () => {
		const roots = buildFileTree([
			{ path: "deep/file.ts", name: "file.ts", isDir: false, ignored: false },
		]);
		expect(roots).toHaveLength(1);
		expect(roots[0].path).toBe("deep/file.ts");
	});

	it("nests entries even when a parent arrives after its children", () => {
		// Lazily-loaded ignored children are appended out of order; buildFileTree
		// must sort by path so parents are processed before their descendants.
		const roots = buildFileTree([
			{
				path: "node_modules/pkg/index.js",
				name: "index.js",
				isDir: false,
				ignored: true,
			},
			{
				path: "node_modules",
				name: "node_modules",
				isDir: true,
				ignored: true,
			},
			{
				path: "node_modules/pkg",
				name: "pkg",
				isDir: true,
				ignored: true,
			},
		]);

		expect(roots).toHaveLength(1);
		const nodeModules = roots[0];
		expect(nodeModules.path).toBe("node_modules");
		expect(nodeModules.children.map((node) => node.name)).toEqual(["pkg"]);
		expect(nodeModules.children[0].children[0].path).toBe(
			"node_modules/pkg/index.js",
		);
	});

	it("carries the git-ignored flag through to tree nodes", () => {
		const roots = buildFileTree([
			{ path: "src", name: "src", isDir: true, ignored: false },
			{
				path: "node_modules",
				name: "node_modules",
				isDir: true,
				ignored: true,
			},
			{ path: ".env", name: ".env", isDir: false, ignored: true },
		]);

		const byName = new Map(roots.map((node) => [node.name, node]));
		expect(byName.get("src")?.ignored).toBe(false);
		expect(byName.get("node_modules")?.ignored).toBe(true);
		expect(byName.get(".env")?.ignored).toBe(true);
	});
});

describe("buildEditedPaths", () => {
	it("marks edited files and every ancestor directory", () => {
		const edited = buildEditedPaths([
			changeItem("src/components/button.tsx"),
			changeItem("docs/readme.md", {
				unstagedStatus: undefined,
				stagedStatus: "M",
			}),
		]);
		expect(edited).toEqual(
			new Set([
				"src/components/button.tsx",
				"src/components",
				"src",
				"docs/readme.md",
				"docs",
			]),
		);
	});

	it("ignores committed-only changes", () => {
		const edited = buildEditedPaths([
			changeItem("src/old.ts", {
				unstagedStatus: undefined,
				stagedStatus: undefined,
				committedStatus: "M",
			}),
		]);
		expect(edited.size).toBe(0);
	});
});
