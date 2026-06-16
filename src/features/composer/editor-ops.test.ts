import { $getRoot, createEditor } from "lexical";
import { describe, expect, it } from "vitest";
import {
	$isBrowserCaptureBadgeNode,
	BrowserCaptureBadgeNode,
} from "./editor/browser-capture-badge-node";
import { $appendComposerInsertItems } from "./editor-ops";

function makeEditor() {
	const editor = createEditor({ nodes: [BrowserCaptureBadgeNode] });
	const host = document.createElement("div");
	editor.setRootElement(host);
	return editor;
}

describe("$appendComposerInsertItems browser-capture", () => {
	it("inserts a BrowserCaptureBadgeNode into the editor", () => {
		const editor = makeEditor();
		editor.update(
			() => {
				$appendComposerInsertItems([
					{
						kind: "browser-capture",
						capturePath: "/tmp/cap.png",
						summary: "example.com · 1 comment",
					},
				]);
				const root = $getRoot();
				const para = root.getFirstChild();
				if (!para || !("getFirstChild" in para)) {
					throw new Error("expected an element paragraph");
				}
				// biome-ignore lint/suspicious/noExplicitAny: test traversal
				const node = (para as any).getFirstChild();
				expect($isBrowserCaptureBadgeNode(node)).toBe(true);
				if ($isBrowserCaptureBadgeNode(node)) {
					expect(node.getCapturePath()).toBe("/tmp/cap.png");
					expect(node.getSummary()).toBe("example.com · 1 comment");
				}
			},
			{ discrete: true },
		);
	});
});
