import { HelpCircleIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * `OpenQuestions` renders unresolved plan questions in a highlighted panel.
 * Children are rendered plan blocks (typically a markdown list). The
 * interactive comment affordance is a later task — for v1 we just render the
 * questions clearly.
 */
export function OpenQuestions({ children }: { children?: ReactNode }) {
	return (
		<div className="my-4 rounded-lg border border-violet-500/40 bg-violet-500/5 p-4">
			<div className="mb-2 flex items-center gap-2 font-medium text-small text-violet-600 dark:text-violet-400">
				<HelpCircleIcon className="size-4 shrink-0" />
				<span>Open questions</span>
			</div>
			{children}
		</div>
	);
}
