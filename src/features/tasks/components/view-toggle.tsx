import { LayoutGrid, List } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE_OUT_QUART } from "../motion";

export type TasksView = "list" | "board";

const OPTIONS: { id: TasksView; label: string; icon: typeof List }[] = [
	{ id: "list", label: "List", icon: List },
	{ id: "board", label: "Board", icon: LayoutGrid },
];

export function ViewToggle({
	value,
	onChange,
}: {
	value: TasksView;
	onChange: (next: TasksView) => void;
}) {
	const reduce = useReducedMotion();
	return (
		<div className="inline-flex items-center gap-0.5 rounded-md border border-border/60 p-0.5">
			{OPTIONS.map((option) => {
				const Icon = option.icon;
				const active = value === option.id;
				return (
					<button
						key={option.id}
						type="button"
						aria-pressed={active}
						aria-label={`${option.label} view`}
						onClick={() => onChange(option.id)}
						className={cn(
							"relative flex h-6 cursor-pointer items-center gap-1.5 rounded px-2 text-small transition-colors duration-150",
							active
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{active ? (
							<motion.span
								layoutId={reduce ? undefined : "tasks-view-toggle"}
								className="absolute inset-0 rounded bg-accent"
								transition={{ duration: 0.22, ease: EASE_OUT_QUART }}
							/>
						) : null}
						<Icon className="relative z-10 size-3.5" />
						<span className="relative z-10">{option.label}</span>
					</button>
				);
			})}
		</div>
	);
}
