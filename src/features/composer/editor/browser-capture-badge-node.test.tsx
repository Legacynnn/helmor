import { createEditor } from "lexical";
import { describe, expect, it } from "vitest";
import {
	$createBrowserCaptureBadgeNode,
	$isBrowserCaptureBadgeNode,
	BrowserCaptureBadgeNode,
} from "./browser-capture-badge-node";

function makeEditor() {
	const editor = createEditor({ nodes: [BrowserCaptureBadgeNode] });
	const host = document.createElement("div");
	editor.setRootElement(host);
	return editor;
}

describe("BrowserCaptureBadgeNode", () => {
	it("round-trips path + summary through exportJSON / importJSON", () => {
		const editor = makeEditor();
		const captured: {
			json: ReturnType<BrowserCaptureBadgeNode["exportJSON"]> | null;
		} = { json: null };
		editor.update(
			() => {
				const node = $createBrowserCaptureBadgeNode(
					"/tmp/capture-1.png",
					"example.com · 2 comments",
				);
				captured.json = node.exportJSON();
			},
			{ discrete: true },
		);

		expect(captured.json).not.toBeNull();
		const json = captured.json as ReturnType<
			BrowserCaptureBadgeNode["exportJSON"]
		>;
		expect(json.type).toBe("browser-capture-badge");
		expect(json.version).toBe(1);
		expect(json.capturePath).toBe("/tmp/capture-1.png");
		expect(json.summary).toBe("example.com · 2 comments");

		editor.update(
			() => {
				const restored = BrowserCaptureBadgeNode.importJSON(json);
				expect(restored.getCapturePath()).toBe("/tmp/capture-1.png");
				expect(restored.getSummary()).toBe("example.com · 2 comments");
			},
			{ discrete: true },
		);
	});

	it("$isBrowserCaptureBadgeNode guards correctly", () => {
		const editor = makeEditor();
		editor.update(
			() => {
				const node = $createBrowserCaptureBadgeNode("/tmp/cap.png", "foo");
				expect($isBrowserCaptureBadgeNode(node)).toBe(true);
				expect($isBrowserCaptureBadgeNode(null)).toBe(false);
				expect($isBrowserCaptureBadgeNode(undefined)).toBe(false);
			},
			{ discrete: true },
		);
	});
});
