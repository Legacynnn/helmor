import { Plug } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { GithubBrandIcon, LinearBrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import type { IntegrationProvider } from "@/lib/api";
import { publishShellEvent } from "@/shell/event-bus";
import { EASE_OUT_EXPO } from "../motion";

/** Shown when no integration is connected for the active provider. */
export function TasksEmptyState({
	provider,
}: {
	provider: IntegrationProvider;
}) {
	const reduce = useReducedMotion();
	const isGithub = provider === "github";
	const icon = isGithub ? (
		<GithubBrandIcon size={24} />
	) : (
		<LinearBrandIcon size={24} />
	);
	const title = isGithub
		? "Connect GitHub to see your tasks"
		: "Connect Linear to see your tasks";
	const description = isGithub
		? "Helmor uses your existing GitHub sign-in — open Settings → Integrations to pick a repository."
		: "Add a personal API key in Settings → Integrations to sync your Linear issues here.";
	return (
		<motion.div
			className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center"
			initial={reduce ? false : { opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
		>
			<div className="flex size-12 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border/40">
				{icon}
			</div>
			<div className="space-y-1">
				<p className="font-medium text-foreground text-ui">{title}</p>
				<p className="max-w-sm text-muted-foreground text-small">
					{description}
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
