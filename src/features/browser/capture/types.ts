/**
 * Structured browser-capture context (issue #55).
 *
 * A `BrowserCapture` is assembled from the content webview at capture time:
 * an annotated screenshot plus structured page context (comments, picks,
 * drawings, console/network/flow traces, visual diff). It rides the existing
 * `images` + `text` wires into the agent — `serializeCaptureContext` renders
 * the structured part into a compact, terminal-agent-friendly text block.
 */

/** Viewport geometry at capture time. */
export type BrowserCaptureViewport = {
	w: number;
	h: number;
	/** Optional device-preset label, e.g. "iPhone 15" or "Desktop". */
	devicePreset?: string;
};

/** A user comment pinned to a DOM element. */
export type BrowserCaptureComment = {
	id: string;
	text: string;
	/** CSS selector of the annotated element. */
	selector: string;
	/** Outer HTML snippet of the annotated element. */
	outerHTML: string;
	/** Optional resolved computed styles for the element. */
	computedStyles?: Record<string, string>;
	/** Path to a cropped screenshot of the element's bounding rect. */
	rectCropPath: string;
};

/** A picked element (inspector-style selection without a comment). */
export type BrowserCapturePick = {
	selector: string;
	outerHTML: string;
	computedStyles: Record<string, string>;
	/** Optional source-map reference (e.g. file:line) when resolvable. */
	sourceRef?: string;
};

/** A free-form drawing overlaid on the page. */
export type BrowserCaptureDrawing = {
	kind: string;
	screenshotPath: string;
};

/** A before/after/diff visual comparison. */
export type BrowserCaptureDiff = {
	beforePath: string;
	afterPath: string;
	diffPath: string;
};

export type BrowserCapture = {
	url: string;
	title: string;
	viewport: BrowserCaptureViewport;
	/** Absolute paths to captured screenshots written in the paste-cache. */
	images: string[];
	comments: BrowserCaptureComment[];
	picks: BrowserCapturePick[];
	drawings: BrowserCaptureDrawing[];
	console?: unknown[];
	network?: unknown[];
	flow?: unknown[];
	diff?: BrowserCaptureDiff;
};

/**
 * Render a `BrowserCapture` into a compact, terminal-agent-friendly text block.
 *
 * Pure and deterministic. Emits a fenced `browser-context` block with the URL,
 * viewport, each comment (selector + text), and each pick (selector). The
 * screenshot image paths travel separately via the `images[]` wire.
 */
export function serializeCaptureContext(capture: BrowserCapture): string {
	const lines: string[] = [`url: ${capture.url}`];

	if (capture.title) {
		lines.push(`title: ${capture.title}`);
	}

	const { w, h, devicePreset } = capture.viewport;
	if (w > 0 && h > 0) {
		const preset = devicePreset ? ` (${devicePreset})` : "";
		lines.push(`viewport: ${w}x${h}${preset}`);
	}

	if (capture.comments.length > 0) {
		lines.push(`comments: ${capture.comments.length}`);
		for (const comment of capture.comments) {
			lines.push(`- ${comment.selector}: ${comment.text}`);
		}
	}

	if (capture.picks.length > 0) {
		lines.push(`picks: ${capture.picks.length}`);
		for (const pick of capture.picks) {
			lines.push(`- ${pick.selector}`);
		}
	}

	return `\`\`\`browser-context\n${lines.join("\n")}\n\`\`\``;
}
