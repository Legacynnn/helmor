import { CodeIcon } from "lucide-react";
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai/code-block";
import { PlanMarkdown } from "./plan-markdown";
import { PlanBlockShell } from "./shell/plan-block-shell";

/**
 * `AnnotatedCode` renders a code block beside an explanatory note. The code
 * comes from the `code` prop or, failing that, from the component's children
 * text (the `code` prop wins). The optional `note` renders as markdown above
 * the code. The shell header is a constant "Code" label; the language chip is
 * rendered by `CodeBlock` itself (from `lang`), so the header doesn't repeat it.
 */
export function AnnotatedCode({
	code,
	lang,
	note,
	children = "",
}: {
	code?: string;
	lang?: string;
	note?: string;
	children?: string;
}) {
	const source = (code ?? children).trim();
	const annotation = note?.trim();

	return (
		<PlanBlockShell
			accent="neutral"
			icon={CodeIcon}
			title="Code"
			bodyClassName="p-3"
		>
			{annotation ? (
				<div className="mb-2 text-small text-muted-foreground">
					<PlanMarkdown>{annotation}</PlanMarkdown>
				</div>
			) : null}
			<CodeBlock code={source} language={lang}>
				<CodeBlockCopyButton />
			</CodeBlock>
		</PlanBlockShell>
	);
}
