import { CodeBlock, CodeBlockCopyButton } from "@/components/ai/code-block";
import { PlanMarkdown } from "./plan-markdown";

/**
 * `AnnotatedCode` renders a code block beside an explanatory note. The code can
 * come from the `code` prop or, failing that, from the component's children
 * text. The optional `note` prop (or remaining children) renders as markdown.
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
		<div className="my-4 rounded-lg border border-border/70 bg-background/60 p-3">
			{annotation ? (
				<div className="mb-2 text-small text-muted-foreground">
					<PlanMarkdown>{annotation}</PlanMarkdown>
				</div>
			) : null}
			<CodeBlock code={source} language={lang}>
				<CodeBlockCopyButton />
			</CodeBlock>
		</div>
	);
}
