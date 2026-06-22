import { Plug } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { LinearBrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import { publishShellEvent } from "@/shell/event-bus";
import { EASE_OUT_EXPO } from "../motion";

/** Shown when no integration is connected for the active provider. */
export function TasksEmptyState() {
	const reduce = useReducedMotion();
	return (
		<motion.div
			className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center"
			initial={reduce ? false : { opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
		>
			<div className="flex size-12 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border/40">
				<LinearBrandIcon size={24} />
			</div>
			<div className="space-y-1">
				<p className="font-medium text-foreground text-ui">
					Connect Linear to see your tasks
				</p>
				<p className="max-w-sm text-muted-foreground text-small">
					Add a personal API key in Settings → Integrations to sync your Linear
					issues here.
				</p>
			</div>
			<Button
				type="button"
				size="sm"
				onClick={() =>
					publishShellEvent({ type: "open-settings", section: "integrations" })
				}
			>
				<Plug className="size-3.5" />
				Open Integrations
			</Button>
		</motion.div>
	);
}
