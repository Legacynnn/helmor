/**
 * Coverage for PasteImagePlugin's clipboard-resident image fallback.
 *
 * macOS WKWebView does not surface "Copy Image" / screenshot-to-clipboard data
 * in the DOM `paste` event (`clipboardData.files` is empty and `text/plain` is
 * blank). The plugin must then fall back to the native pasteboard read
 * (`readClipboardImage`) and insert an ImageBadgeNode for the saved path.
 *
 * These tests dispatch PASTE_COMMAND with synthetic clipboard events and assert
 * the fallback fires only when there's no file and no text — never swallowing a
 * normal text paste.
 */

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { LexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { act, cleanup, render } from "@testing-library/react";
import { $getRoot, type LexicalEditor, PASTE_COMMAND } from "lexical";
import { useContext } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomTagBadgeNode } from "../custom-tag-badge-node";
import { FileBadgeNode } from "../file-badge-node";
import { $isImageBadgeNode, ImageBadgeNode } from "../image-badge-node";
import { PasteImagePlugin } from "./paste-image-plugin";

vi.mock("@/lib/api", () => ({
	readClipboardImage: vi.fn(),
	savePastedImage: vi.fn(),
}));

import { readClipboardImage } from "@/lib/api";

const readClipboardImageMock = vi.mocked(readClipboardImage);

afterEach(() => {
	cleanup();
});

beforeEach(() => {
	readClipboardImageMock.mockReset();
});

function CaptureEditor({ onReady }: { onReady: (e: LexicalEditor) => void }) {
	const ctx = useContext(LexicalComposerContext);
	if (ctx) {
		onReady(ctx[0]);
	}
	return null;
}

function renderPlugin(sessionId = "session-1") {
	let editor!: LexicalEditor;
	render(
		<LexicalComposer
			initialConfig={{
				namespace: "paste-image-test",
				onError: (error) => {
					throw error;
				},
				nodes: [ImageBadgeNode, FileBadgeNode, CustomTagBadgeNode],
			}}
		>
			<PasteImagePlugin sessionId={sessionId} />
			<CaptureEditor
				onReady={(e) => {
					editor = e;
				}}
			/>
		</LexicalComposer>,
	);
	return editor;
}

/** Synthetic clipboard paste event. */
function makePasteEvent(opts: { files?: File[]; text?: string }) {
	return {
		preventDefault: vi.fn(),
		clipboardData: {
			files: opts.files ?? [],
			getData: (_format: string) => opts.text ?? "",
		},
	};
}

/** Collect image-badge paths from the current editor state. */
function imageBadgePaths(editor: LexicalEditor): string[] {
	const paths: string[] = [];
	editor.getEditorState().read(() => {
		const walk = (node: ReturnType<typeof $getRoot>) => {
			for (const child of node.getChildren()) {
				if ($isImageBadgeNode(child)) {
					paths.push(child.getImagePath());
				} else if ("getChildren" in child) {
					walk(child as ReturnType<typeof $getRoot>);
				}
			}
		};
		walk($getRoot());
	});
	return paths;
}

async function flush() {
	await Promise.resolve();
	await Promise.resolve();
}

describe("PasteImagePlugin clipboard-resident image fallback", () => {
	it("reads the native clipboard and inserts a badge when no file and no text", async () => {
		readClipboardImageMock.mockResolvedValue(
			"/cache/paste/session-1/paste-x.png",
		);
		const editor = renderPlugin();

		const event = makePasteEvent({ files: [], text: "" });
		await act(async () => {
			editor.dispatchCommand(PASTE_COMMAND, event as never);
			await flush();
		});

		expect(event.preventDefault).toHaveBeenCalled();
		expect(readClipboardImageMock).toHaveBeenCalledWith("session-1");
		expect(imageBadgePaths(editor)).toEqual([
			"/cache/paste/session-1/paste-x.png",
		]);
	});

	it("inserts nothing when the native clipboard has no image", async () => {
		readClipboardImageMock.mockResolvedValue(null);
		const editor = renderPlugin();

		await act(async () => {
			editor.dispatchCommand(
				PASTE_COMMAND,
				makePasteEvent({ files: [], text: "" }) as never,
			);
			await flush();
		});

		expect(readClipboardImageMock).toHaveBeenCalledTimes(1);
		expect(imageBadgePaths(editor)).toEqual([]);
	});

	it("does not query the native clipboard for a plain-text paste", async () => {
		const editor = renderPlugin();

		await act(async () => {
			editor.dispatchCommand(
				PASTE_COMMAND,
				makePasteEvent({ files: [], text: "just some text" }) as never,
			);
			await flush();
		});

		expect(readClipboardImageMock).not.toHaveBeenCalled();
	});
});
