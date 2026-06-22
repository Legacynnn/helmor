import { planChildMode } from "./registry";

/** A capitalised JSX tag with its leading indentation captured. */
const TAG_OPEN = /^(\s*)<([A-Za-z][A-Za-z0-9]*)(?=[\s/>]|$)/;

export type MaskResult = {
	/** Body with every raw component's inner text removed (bodies are non-MDX —
	 * JS, diffs, generics — and would otherwise crash the MDX/acorn parse). */
	body: string;
	/** Verbatim inner text for each masked component, keyed by injected id. */
	stash: Map<string, string>;
};

/**
 * Pre-pass that protects the MDX parser from raw-content component bodies.
 *
 * Components whose `childMode` is `"raw"` (Preview, Diff, Diagram, Wireframe,
 * Steps, FileMap, AnnotatedCode, Entity, …) carry verbatim text that is NOT
 * valid MDX — a `<Preview>`'s React body has JS statements and `{…}`, a `<Diff>`
 * has `{` in code, a DataModel `<Entity>` has `Record<string, string>` generics
 * that look like broken JSX. remark-mdx runs all of this through acorn and
 * throws, which previously blanked the WHOLE plan.
 *
 * This pass finds each raw component with a body, lifts the inner text into
 * `stash` (verbatim — no escaping), and rewrites the element to a self-closing
 * tag carrying a `__rawid` so the parser can reattach the body afterwards. The
 * remaining document is clean MDX the parser can read. Self-closing raw
 * components (e.g. `<AnnotatedCode code="…" />`) have no body and are left as-is
 * — a malformed attribute there is handled later by component isolation.
 */
export function maskRawComponentBodies(body: string): MaskResult {
	const lines = body.split("\n");
	const out: string[] = [];
	const stash = new Map<string, string>();
	let id = 0;
	let i = 0;
	let inFence = false;
	while (i < lines.length) {
		const line = lines[i];
		// Never mask inside a fenced code block — a plan may SHOW component
		// markup as an example; that text must stay verbatim, not be parsed.
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
			out.push(line);
			i++;
			continue;
		}
		const match = inFence ? null : TAG_OPEN.exec(line);
		if (!match || planChildMode(match[2]) !== "raw") {
			out.push(line);
			i++;
			continue;
		}
		const tag = match[2];
		// Find the line that closes the opening tag (ends with `>` or `/>`).
		let openEnd = i;
		while (openEnd < lines.length && !/>\s*$/.test(lines[openEnd])) {
			openEnd++;
		}
		if (openEnd >= lines.length) {
			out.push(line);
			i++;
			continue;
		}
		// Self-closing → no body to mask; pass the element through untouched.
		if (lines[openEnd].replace(/\s+$/, "").endsWith("/>")) {
			for (let k = i; k <= openEnd; k++) {
				out.push(lines[k]);
			}
			i = openEnd + 1;
			continue;
		}
		// Block form: find the matching close at the same indentation.
		let close = -1;
		for (let j = openEnd + 1; j < lines.length; j++) {
			if (lines[j].trim() === `</${tag}>`) {
				close = j;
				break;
			}
		}
		if (close === -1) {
			out.push(line);
			i++;
			continue;
		}
		const rid = `r${id++}`;
		stash.set(
			rid,
			lines
				.slice(openEnd + 1, close)
				.join("\n")
				.trim(),
		);
		// Re-emit the opening tag lines, injecting `__rawid` before the final `>`
		// and self-closing the element so its (removed) body can't reach acorn.
		for (let k = i; k < openEnd; k++) {
			out.push(lines[k]);
		}
		const openLine = lines[openEnd].replace(/\s+$/, "");
		out.push(`${openLine.slice(0, -1)} __rawid="${rid}" />`);
		i = close + 1;
	}
	return { body: out.join("\n"), stash };
}
