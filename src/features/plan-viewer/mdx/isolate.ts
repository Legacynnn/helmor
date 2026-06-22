/** A top-level component span located in raw MDX body text, by char offset. */
export type ComponentSpan = { tag: string; start: number; end: number };

/** A capitalised JSX tag at the very start of a line (column 0). Per the plan
 * authoring contract every component sits on its own line, so column-0 tags are
 * the reliable anchor for locating top-level blocks without a full parser. */
const TAG_OPEN = /^<([A-Za-z][A-Za-z0-9]*)/;

/**
 * Scan the body for TOP-LEVEL component spans (column-0 `<Tag …>` … `</Tag>` or
 * self-closing `<Tag … />`), returning each span's tag and char range. This is a
 * deliberately simple, parser-free scan used only for error isolation: when the
 * strict MDX parse fails, the caller test-parses each span independently so a
 * single malformed component can be replaced without losing the rest.
 *
 * Heuristics (matching how plans are authored):
 * - A span starts on a line beginning with `<Tag` at column 0.
 * - The opening tag ends at the first line that ends with `>` (or `/>`). A line
 *   ending in `/>` is self-closing — the span is just the opening tag.
 * - Otherwise the span runs to the next column-0 `</Tag>` for the same tag.
 * - A start with no clean tag-close / no matching close is skipped (not a clean
 *   top-level component), so we never swallow the rest of the document.
 */
export function scanTopLevelComponents(body: string): ComponentSpan[] {
	const spans: ComponentSpan[] = [];
	const lines = body.split("\n");
	const starts: number[] = [];
	let off = 0;
	for (const line of lines) {
		starts.push(off);
		off += line.length + 1; // + newline
	}
	const lineEnd = (i: number) => starts[i] + lines[i].length;

	let i = 0;
	let inFence = false;
	while (i < lines.length) {
		// Skip fenced code blocks — markup shown as an example isn't a component.
		if (/^\s*(```|~~~)/.test(lines[i])) {
			inFence = !inFence;
			i++;
			continue;
		}
		const match = inFence ? null : TAG_OPEN.exec(lines[i]);
		if (!match) {
			i++;
			continue;
		}
		const tag = match[1];
		// Find the line that closes the opening tag (ends with `>`).
		let openEnd = i;
		while (openEnd < lines.length && !/>\s*$/.test(lines[openEnd])) {
			openEnd++;
		}
		if (openEnd >= lines.length) {
			// No tag close in the rest of the document — not a clean component.
			i++;
			continue;
		}
		if (lines[openEnd].replace(/\s+$/, "").endsWith("/>")) {
			spans.push({ tag, start: starts[i], end: lineEnd(openEnd) });
			i = openEnd + 1;
			continue;
		}
		// Block component: find the matching close at column 0.
		let close = -1;
		for (let j = openEnd + 1; j < lines.length; j++) {
			if (lines[j].trim() === `</${tag}>`) {
				close = j;
				break;
			}
		}
		if (close === -1) {
			i = openEnd + 1;
			continue;
		}
		spans.push({ tag, start: starts[i], end: lineEnd(close) });
		i = close + 1;
	}
	return spans;
}

/** The sentinel component a malformed block is replaced with during isolation.
 * Registered in the plan component allowlist so it renders a friendly error. */
export const MALFORMED_SENTINEL = "HelmorMalformedBlock";

/**
 * Given the body and a predicate that reports whether a snippet parses as MDX,
 * replace every top-level component span that does NOT parse with a sentinel
 * `<HelmorMalformedBlock name="Tag" />`. Returns the patched body, or `null`
 * when nothing was replaced (so the caller can fall through to its own
 * last-resort handling). The good spans and surrounding prose are preserved
 * verbatim, so only the broken component is sacrificed.
 */
export function isolateMalformedComponents(
	body: string,
	parses: (snippet: string) => boolean,
): string | null {
	const spans = scanTopLevelComponents(body);
	if (spans.length === 0) {
		return null;
	}
	let replaced = false;
	let out = "";
	let last = 0;
	for (const span of spans) {
		out += body.slice(last, span.start);
		const src = body.slice(span.start, span.end);
		if (parses(src)) {
			out += src;
		} else {
			out += `<${MALFORMED_SENTINEL} name="${span.tag}" />`;
			replaced = true;
		}
		last = span.end;
	}
	out += body.slice(last);
	return replaced ? out : null;
}
