/** A node in a parsed wireframe mockup. Containers (`row`/`col`/`box`) hold
 * children; the rest are leaves. */
export type WireframeNode = {
	type:
		| "row"
		| "col"
		| "box"
		| "text"
		| "input"
		| "button"
		| "image"
		| "divider";
	label: string;
	children: WireframeNode[];
};

const TYPES = new Set([
	"row",
	"col",
	"box",
	"text",
	"input",
	"button",
	"image",
	"divider",
]);

/**
 * Parse the constrained wireframe line-DSL: one element per line, leading
 * whitespace = nesting depth, `<type> <label?>`. Unknown element types and
 * blank lines are skipped (their indented descendants reattach to the nearest
 * valid ancestor). Returns the forest of top-level nodes.
 */
export function parseWireframe(src: string): WireframeNode[] {
	const roots: WireframeNode[] = [];
	const stack: { indent: number; node: WireframeNode }[] = [];
	for (const raw of src.split(/\r?\n/)) {
		if (raw.trim().length === 0) {
			continue;
		}
		const indent = raw.length - raw.trimStart().length;
		const trimmed = raw.trim();
		const sp = trimmed.indexOf(" ");
		const type = (sp === -1 ? trimmed : trimmed.slice(0, sp)).toLowerCase();
		const label = sp === -1 ? "" : trimmed.slice(sp + 1).trim();
		if (!TYPES.has(type)) {
			continue;
		}
		const node: WireframeNode = {
			type: type as WireframeNode["type"],
			label,
			children: [],
		};
		while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
			stack.pop();
		}
		if (stack.length === 0) {
			roots.push(node);
		} else {
			stack[stack.length - 1].node.children.push(node);
		}
		stack.push({ indent, node });
	}
	return roots;
}
