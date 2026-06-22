import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlanMarkdown } from "../plan-markdown";
import type { Step } from "./parse-steps";

/**
 * Connected vertical stepper. Each step is a numbered (or checked) marker joined
 * to the next by a connector line. `done` steps show a check, `active` steps get
 * an accent ring, and step text is rendered through {@link PlanMarkdown} so
 * inline markdown (bold, code) still works.
 */
export function Stepper({ steps }: { steps: Step[] }) {
	return (
		<ol className="flex flex-col">
			{steps.map((step, i) => {
				const last = i === steps.length - 1;
				const done = step.status === "done";
				const active = step.status === "active";
				return (
					<li
						key={`${i}-${step.text}`}
						className="relative flex gap-3 pb-4 last:pb-0"
					>
						{/* Connector line down to the next marker. */}
						{!last ? (
							<span
								aria-hidden="true"
								className="absolute top-6 bottom-0 left-[11px] w-px bg-border"
							/>
						) : null}
						<span
							className={cn(
								"relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-micro font-medium",
								done
									? "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
									: active
										? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/25"
										: "border-border bg-background text-muted-foreground",
							)}
						>
							{done ? <CheckIcon className="size-3.5" /> : i + 1}
						</span>
						<div
							className={cn(
								"min-w-0 flex-1 pt-0.5 text-small",
								active ? "font-medium text-foreground" : null,
							)}
						>
							<PlanMarkdown className="[&_p]:my-0">{step.text}</PlanMarkdown>
						</div>
					</li>
				);
			})}
		</ol>
	);
}
