import { PlanMarkdown } from "./plan-markdown";

/**
 * `Diagram` renders a mermaid diagram. The children text is the mermaid source;
 * we wrap it in a fenced ```mermaid block and pass it through the shared
 * Streamdown renderer, which keeps the app's existing mermaid handling intact.
 */
export function Diagram({ children = "" }: { children?: string }) {
	const source = children.trim();
	const fenced = `\`\`\`mermaid\n${source}\n\`\`\``;
	return (
		<div className="my-4">
			<PlanMarkdown>{fenced}</PlanMarkdown>
		</div>
	);
}
