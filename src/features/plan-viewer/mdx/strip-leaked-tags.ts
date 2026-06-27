/**
 * Agent tool-call wrapper tags that occasionally leak into an agent-authored
 * plan body — e.g. a `Write` call whose closing `</content></invoke>` gets
 * serialized into the file it was writing. These are never valid plan MDX, and
 * a single stray closing tag makes remark-mdx throw ("Unexpected closing slash
 * `/` in tag, expected an open tag first"), which the component-isolation
 * recovery can't repair (they aren't capitalised component spans) — so the
 * WHOLE plan silently degrades to plain Markdown and every `<PlanCanvas>` /
 * `<Decision>` / … renders as prose. Stripping them lets the rest parse.
 */
const LEAKED_TAGS = [
	"function_calls",
	"invoke",
	"parameter",
	"content",
	// Namespaced harness variants (e.g. `<invoke>`).
	"antml:[A-Za-z0-9:_-]+",
];

/** A line that is ENTIRELY a single leaked wrapper tag (open, close, or
 * self-closing), with optional attributes. Whole-line only, so an inline
 * mention in prose ("the `</invoke>` tag") or a tag mid-sentence is never
 * touched. */
const LEAKED_TAG_LINE = new RegExp(
	`^\\s*</?(?:${LEAKED_TAGS.join("|")})\\b[^>]*>\\s*$`,
);

const FENCE = /^\s*(```|~~~)/;

/**
 * Remove whole-line leaked tool-call wrapper tags from a plan body.
 *
 * - Only acts on lines OUTSIDE fenced code blocks — a plan may legitimately
 *   *show* such markup inside a ``` example fence, and that must stay verbatim.
 * - Returns `null` when nothing was removed, so callers can keep the original
 *   (byte-identical) body for the overwhelming common case of a clean plan and
 *   only pay the cost on an actually-corrupt one.
 */
export function stripLeakedToolTags(body: string): string | null {
	const lines = body.split("\n");
	const out: string[] = [];
	let inFence = false;
	let removed = false;
	for (const line of lines) {
		if (FENCE.test(line)) {
			inFence = !inFence;
			out.push(line);
			continue;
		}
		if (!inFence && LEAKED_TAG_LINE.test(line)) {
			removed = true;
			continue;
		}
		out.push(line);
	}
	return removed ? out.join("\n") : null;
}
