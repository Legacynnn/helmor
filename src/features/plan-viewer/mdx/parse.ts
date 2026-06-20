import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

export type PlanBlock =
	| { kind: "prose"; id: string; markdown: string }
	| {
			kind: "component";
			id: string;
			name: string;
			props: Record<string, string>;
			children: string;
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
		if (
			attr.type === "mdxJsxAttribute" &&
			typeof attr.name === "string" &&
			typeof attr.value === "string"
		) {
			props[attr.name] = attr.value;
		}
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

export function parsePlanMdx(src: string): ParsedPlan {
	const { yaml, body } = splitFrontmatter(src);
	const frontmatter = parseFrontmatter(yaml);

	const tree = unified()
		.use(remarkParse)
		.use(remarkMdx)
		.parse(body) as unknown as MdastNode;

	const blocks: PlanBlock[] = [];
	let index = 0;
	const nextId = () => `b${index++}`;

	for (const node of tree.children ?? []) {
		if (node.type === "mdxJsxFlowElement") {
			blocks.push({
				kind: "component",
				id: nextId(),
				name: node.name ?? "Unknown",
				props: attributesToProps(node),
				children: childrenText(node, body),
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

	return { frontmatter, blocks };
}
