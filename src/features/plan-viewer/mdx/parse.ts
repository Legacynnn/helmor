import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { isolateMalformedComponents } from "./isolate";
import { maskRawComponentBodies } from "./mask-raw";
import { planChildMode } from "./registry";

export type PlanBlock =
	| { kind: "prose"; id: string; markdown: string }
	| {
			kind: "component";
			id: string;
			name: string;
			props: Record<string, string>;
			/** Verbatim inner source text — always captured; used by raw-mode components. */
			rawText: string;
			/**
			 * Recursively parsed nested blocks. Populated when the component is
			 * known AND its `childMode` is `"blocks"` or `"structured"`; empty
			 * otherwise (including `"raw"` and unknown components).
			 */
			childBlocks: PlanBlock[];
	  };

export type PlanFrontmatter = {
	title?: string;
	status?: string;
	summary?: string;
};

export type ParsedPlan = {
	frontmatter: PlanFrontmatter;
	blocks: PlanBlock[];
};

type Position = {
	start: { offset?: number };
	end: { offset?: number };
};

type MdastNode = {
	type: string;
	name?: string;
	attributes?: Array<{ type: string; name?: string; value?: unknown }>;
	children?: MdastNode[];
	position?: Position;
};

/**
 * Split off a leading YAML frontmatter fence. The closing `---` must be a full
 * fence line (terminated by a newline or EOF) so a body horizontal rule like
 * `\n---\n` cannot be mistaken for the end of the frontmatter.
 */
function splitFrontmatter(src: string): { yaml: string; body: string } {
	if (!src.startsWith("---")) {
		return { yaml: "", body: src };
	}
	// The opening fence must be its own line.
	const afterOpen = src.indexOf("\n");
	if (afterOpen === -1 || src.slice(3, afterOpen).trim() !== "") {
		return { yaml: "", body: src };
	}
	// Find a closing fence line: `\n---` followed by newline or EOF.
	const fence = /\n---[ \t]*(?:\r?\n|$)/.exec(src);
	if (!fence) {
		return { yaml: "", body: src };
	}
	const yaml = src.slice(afterOpen + 1, fence.index);
	const body = src.slice(fence.index + fence[0].length);
	return { yaml, body };
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function parseFrontmatter(yaml: string): PlanFrontmatter {
	const out: PlanFrontmatter = {};
	for (const line of yaml.split(/\r?\n/)) {
		const match = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
		if (!match) {
			continue;
		}
		const key = match[1];
		const value = unquote(match[2] ?? "");
		if (key === "title" || key === "status" || key === "summary") {
			out[key] = value;
		}
	}
	return out;
}

function attributesToProps(node: MdastNode): Record<string, string> {
	const props: Record<string, string> = {};
	for (const attr of node.attributes ?? []) {
		if (attr.type !== "mdxJsxAttribute" || typeof attr.name !== "string") {
			continue;
		}
		if (typeof attr.value === "string") {
			props[attr.name] = attr.value;
			continue;
		}
		// Boolean/valueless attribute (e.g. `<FileMap compact />`): MDX reports
		// `value == null`. Follow the HTML boolean-attribute convention.
		if (attr.value == null) {
			props[attr.name] = "true";
		}
		// Expression-valued attributes (e.g. `severity={x}`) are intentionally
		// ignored: the parser never evaluates JS, so there is no value to read.
	}
	return props;
}

/** Raw source text spanning the node's children (between open/close tags). */
function childrenText(node: MdastNode, body: string): string {
	const children = node.children ?? [];
	const first = children.find((c) => c.position?.start?.offset != null);
	const last = [...children]
		.reverse()
		.find((c) => c.position?.end?.offset != null);
	const start = first?.position?.start?.offset;
	const end = last?.position?.end?.offset;
	if (start == null || end == null) {
		return "";
	}
	return body.slice(start, end).trim();
}

function nodeSource(node: MdastNode, body: string): string {
	const start = node.position?.start?.offset;
	const end = node.position?.end?.offset;
	if (start == null || end == null) {
		return "";
	}
	return body.slice(start, end);
}

function mdxParse(body: string): MdastNode {
	return unified()
		.use(remarkParse)
		.use(remarkMdx)
		.parse(body) as unknown as MdastNode;
}

/** Escape `{`/`}` to HTML entities everywhere OUTSIDE fenced code blocks and
 *  inline code spans. The entities render back as literal braces, but acorn no
 *  longer sees an expression to choke on — so a stray brace in prose stops
 *  crashing the MDX parse while components (which use no braces) still work. */
function escapeBracesOutsideCode(src: string): string {
	const codeRe = /```[\s\S]*?```|`[^`\n]*`/g;
	const escapeBraces = (s: string) =>
		s.replace(/[{}]/g, (c) => (c === "{" ? "&#123;" : "&#125;"));
	let out = "";
	let last = 0;
	for (const match of src.matchAll(codeRe)) {
		const start = match.index ?? 0;
		out += escapeBraces(src.slice(last, start));
		out += match[0];
		last = start + match[0].length;
	}
	out += escapeBraces(src.slice(last));
	return out;
}

/** Whether a snippet parses as MDX, retrying with braces escaped (mirrors the
 * document-level tiers). Used to test individual component spans in isolation. */
function snippetParses(snippet: string): boolean {
	try {
		mdxParse(snippet);
		return true;
	} catch {
		try {
			mdxParse(escapeBracesOutsideCode(snippet));
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * Parse the document body into an mdast tree. Strict MDX (remark-mdx) runs the
 * content through acorn, which throws on any `{…}` that isn't valid JS — e.g. a
 * stray `{`, JSON, or a code-ish snippet in agent-authored prose ("Could not
 * parse expression with acorn"), OR a malformed component (e.g. invalid `\"`
 * attribute escapes). Recovery tiers, in order:
 *   1. strict MDX;
 *   2. retry with braces escaped outside code (fixes stray-brace prose);
 *   3. ISOLATE — replace only the top-level component span(s) that fail to parse
 *      with a sentinel error block, so one malformed component no longer blanks
 *      the whole plan, and re-parse;
 *   4. last resort — plain Markdown (every component degrades to text).
 * Returns the body the tree's offsets refer to (an escaped/patched variant when
 * a later tier was used), since the caller slices by byte offset.
 */
function parseBody(body: string): { tree: MdastNode; body: string } {
	try {
		return { tree: mdxParse(body), body };
	} catch {
		const escaped = escapeBracesOutsideCode(body);
		try {
			return { tree: mdxParse(escaped), body: escaped };
		} catch {
			// Tier 3: isolate the malformed component(s) and re-parse the rest.
			const isolated = isolateMalformedComponents(body, snippetParses);
			if (isolated != null) {
				const isolatedEscaped = escapeBracesOutsideCode(isolated);
				try {
					return { tree: mdxParse(isolatedEscaped), body: isolatedEscaped };
				} catch {
					// fall through to plain Markdown
				}
			}
			return {
				tree: unified().use(remarkParse).parse(body) as unknown as MdastNode,
				body,
			};
		}
	}
}

export function parsePlanMdx(src: string): ParsedPlan {
	const { yaml, body: rawBody } = splitFrontmatter(src);
	const frontmatter = parseFrontmatter(yaml);

	// Lift raw-content component bodies (Preview JS, diffs, generics, …) out of
	// the source BEFORE MDX parsing — they are not valid MDX and would otherwise
	// crash the parse. They are reattached verbatim from `stash` during the walk.
	const { body: maskedBody, stash } = maskRawComponentBodies(rawBody);
	const { tree, body } = parseBody(maskedBody);

	// A single counter keeps ids unique and stable in document order, including
	// nested blocks (the counter is shared across recursion).
	let index = 0;
	const nextId = () => `b${index++}`;

	/** True when a paragraph's only meaningful children are JSX elements (so it is
	 * really a wrapper around nested components, not prose). A nested component on
	 * its own line inside a flow element parses as a `paragraph` holding
	 * `mdxJsxTextElement`s; we unwrap those into component blocks. */
	function isComponentWrapperParagraph(node: MdastNode): boolean {
		if (node.type !== "paragraph") {
			return false;
		}
		const children = node.children ?? [];
		let sawElement = false;
		for (const child of children) {
			if (child.type === "mdxJsxTextElement") {
				sawElement = true;
				continue;
			}
			if (child.type === "text") {
				const raw = nodeSource(child, body);
				if (raw.trim().length === 0) {
					continue;
				}
			}
			return false;
		}
		return sawElement;
	}

	/** Convert a flat list of mdast nodes into plan blocks, recursing into
	 * children of components whose childMode is "blocks" or "structured". */
	function walk(nodes: MdastNode[]): PlanBlock[] {
		const blocks: PlanBlock[] = [];
		for (const node of nodes) {
			// Unwrap a paragraph that only wraps nested JSX elements: walk its
			// element children directly so they become component blocks.
			if (isComponentWrapperParagraph(node)) {
				const elements = (node.children ?? []).filter(
					(c) => c.type === "mdxJsxTextElement",
				);
				blocks.push(...walk(elements));
				continue;
			}
			if (
				node.type === "mdxJsxFlowElement" ||
				node.type === "mdxJsxTextElement"
			) {
				const name = node.name ?? "Unknown";
				const id = nextId();
				const props = attributesToProps(node);
				// A masked raw component carries `__rawid`; reattach its verbatim
				// body from the stash instead of slicing the (now self-closed) source.
				let rawText = childrenText(node, body);
				const rawId = props.__rawid;
				if (rawId != null) {
					delete props.__rawid;
					rawText = stash.get(rawId) ?? rawText;
				}
				const mode = planChildMode(name);
				const childBlocks =
					mode === "blocks" || mode === "structured"
						? walk(node.children ?? [])
						: [];
				blocks.push({
					kind: "component",
					id,
					name,
					props,
					rawText,
					childBlocks,
				});
				continue;
			}
			// Ignore bare JSX expression nodes (`{...}`) — no runtime evaluation.
			if (
				node.type === "mdxFlowExpression" ||
				node.type === "mdxjsEsm" ||
				node.type === "mdxTextExpression"
			) {
				continue;
			}
			const markdown = nodeSource(node, body).trim();
			if (markdown.length === 0) {
				continue;
			}
			blocks.push({ kind: "prose", id: nextId(), markdown });
		}
		return blocks;
	}

	return { frontmatter, blocks: walk(tree.children ?? []) };
}
