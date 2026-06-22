import { HelpCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PlanBlockShell } from "./shell/plan-block-shell";

/**
 * `OpenQuestions` renders unresolved plan questions in a highlighted panel.
 * Children are rendered plan blocks (typically a markdown list).
 */
export function OpenQuestions({ children }: { children?: ReactNode }) {
	return (
		<PlanBlockShell
			accent="highlight"
			icon={HelpCircleIcon}
			title="Open questions"
		>
			{children}
		</PlanBlockShell>
	);
}
