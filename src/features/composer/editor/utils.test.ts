import { $createParagraphNode, $getRoot, createEditor } from "lexical";
import { describe, expect, it } from "vitest";
import {
	$createBrowserCaptureBadgeNode,
	BrowserCaptureBadgeNode,
} from "./browser-capture-badge-node";
import { $extractComposerContent } from "./utils";

function makeEditor() {
	const editor = createEditor({ nodes: [BrowserCaptureBadgeNode] });
	const host = document.createElement("div");
	editor.setRootElement(host);
	return editor;
}

describe("$extractComposerContent with browser-capture badge", () => {
	it("pushes capturePath into images[] and @path into text", () => {
		const editor = makeEditor();
		const captured: {
			result: ReturnType<typeof $extractComposerContent> | null;
		} = { result: null };
		editor.update(
			() => {
				const root = $getRoot();
				root.clear();
				const para = $createParagraphNode();
				para.append(
					$createBrowserCaptureBadgeNode(
						"/tmp/capture-1.png",
						"example.com · 2 comments",
					),
				);
				root.append(para);
				captured.result = $extractComposerContent();
			},
			{ discrete: true },
		);

		expect(captured.result).not.toBeNull();
		const extracted = captured.result as ReturnType<
			typeof $extractComposerContent
		>;
		expect(extracted.images).toContain("/tmp/capture-1.png");
		expect(extracted.text).toContain("@/tmp/capture-1.png");
	});
});
