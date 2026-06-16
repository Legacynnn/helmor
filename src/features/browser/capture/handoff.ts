/**
 * Browser-capture agent handoff (issue #55).
 *
 * Turns a {@link BrowserCapture} into composer insert items and routes them
 * into either the active agent's composer or a freshly-spawned session. The
 * screenshot rides the existing `images` wire (via the `browser-capture` badge
 * item) and the structured page context rides the `text` wire (a fenced
 * `browser-context` block), so terminal agents — which only receive paths +
 * text — get the full context too.
 *
 * The composer-enqueue dependency is injected (`InsertIntoComposer`) so the
 * handoff functions stay pure-ish and unit-testable without a React tree.
 */

import { browserCapture, createSession } from "@/lib/api";
import type {
	ComposerInsertItem,
	ComposerInsertRequest,
} from "@/lib/composer-insert";
import type { InsertIntoComposer } from "@/lib/composer-insert-context";
import type { BrowserCapture } from "./types";
import { serializeCaptureContext } from "./types";

/** Short, human-readable label for the capture badge: page host + comment count. */
export function captureSummary(capture: BrowserCapture): string {
	let host = capture.url;
	try {
		host = new URL(capture.url).host || capture.url;
	} catch {
		host = capture.url;
	}

	const parts = [host];
	const commentCount = capture.comments.length;
	if (commentCount > 0) {
		parts.push(`${commentCount} comment${commentCount === 1 ? "" : "s"}`);
	}
	return parts.join(" · ");
}

/**
 * Build the composer insert items for a capture:
 * - a `browser-capture` badge item carrying the first screenshot path (skipped
 *   when no screenshot was produced), and
 * - a `text` item with the serialized `browser-context` block, so structured
 *   context (url, viewport, comments, picks) reaches terminal agents.
 *
 * Pure and deterministic.
 */
export function buildCaptureInsertItems(
	capture: BrowserCapture,
): ComposerInsertItem[] {
	const items: ComposerInsertItem[] = [];

	const capturePath = capture.images[0];
	if (capturePath) {
		items.push({
			kind: "browser-capture",
			capturePath,
			summary: captureSummary(capture),
		});
	}

	items.push({ kind: "text", text: serializeCaptureContext(capture) });

	return items;
}

/** Build the `ComposerInsertRequest` for a capture, optionally targeting a session. */
function buildCaptureInsertRequest(
	capture: BrowserCapture,
	target?: { workspaceId?: string | null; sessionId?: string | null },
): ComposerInsertRequest {
	return {
		target,
		items: buildCaptureInsertItems(capture),
		behavior: "append",
	};
}

/**
 * Send a capture to the active agent's composer by enqueuing an insert request.
 * `enqueue` is the real `useComposerInsert()` callback; with no explicit target
 * the request lands in the currently-displayed composer.
 */
export function sendCaptureToActiveAgent(
	capture: BrowserCapture,
	enqueue: InsertIntoComposer,
): void {
	enqueue(buildCaptureInsertRequest(capture));
}

export type SendCaptureToNewAgentOptions = {
	/** Spawn a Terminal (live PTY) session instead of the default GUI session. */
	terminal?: boolean;
	/** Pin the Terminal preset CLI (e.g. "claude", "codex"). */
	agentType?: string | null;
};

/**
 * Spawn a new agent session in `workspaceId` and preload the capture into its
 * composer. Terminal-safe: the items reduce to image paths + a text context
 * block, both of which a Terminal session consumes natively.
 *
 * Returns the new `sessionId` so the caller can select/focus it.
 */
export async function sendCaptureToNewAgent(
	workspaceId: string,
	capture: BrowserCapture,
	enqueue: InsertIntoComposer,
	opts?: SendCaptureToNewAgentOptions,
): Promise<string> {
	const { sessionId } = await createSession(workspaceId, {
		sessionKind: opts?.terminal ? "terminal" : "gui",
		agentType: opts?.agentType ?? null,
	});

	enqueue(buildCaptureInsertRequest(capture, { workspaceId, sessionId }));

	return sessionId;
}

/**
 * Persist a base64 PNG into the session paste-cache and return the path. Thin
 * convenience over the `browser_capture` IPC for callers that hold raw PNG
 * bytes and a bound session id; the resulting path is what populates
 * `BrowserCapture.images`.
 */
export async function persistCapturePng(
	sessionId: string,
	base64Png: string,
): Promise<string> {
	return browserCapture(sessionId, base64Png);
}
