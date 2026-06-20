import { Suspense } from "react";
import { LazyStreamdown } from "@/components/streamdown-loader";
import { cn } from "@/lib/utils";

/**
 * Static markdown renderer for plan block content. Wraps the shared lazy
 * Streamdown kit so every plan component renders prose, code, and mermaid
 * exactly like the rest of the app.
 */
export function PlanMarkdown({
	children,
	className,
}: {
	children: string;
	className?: string;
}) {
	return (
		<Suspense
			fallback={
				<pre className="whitespace-pre-wrap break-words text-small">
					{children}
				</pre>
			}
		>
			<LazyStreamdown
				className={cn("conversation-streamdown", className)}
				mode="static"
			>
				{children}
			</LazyStreamdown>
		</Suspense>
	);
}
