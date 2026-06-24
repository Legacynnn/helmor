/**
 * A slim strip of currently-running subagent chips, glued to the top edge of
 * the composer (rounded top corners, composer-matching surface) inside the
 * composer's `pointer-events-none` overlay zone. Appears only while at least
 * one subagent is running and animates its height + opacity in/out. Clicking a
 * chip filters the thread to that subagent's outputs (toggling off when
 * re-clicked). Each chip carries a deterministic pixel-art sprite so agents are
 * visually distinct.
 */

import { useRef } from "react";
import { useSubagentFilter } from "@/features/conversation/state/subagent-filter-store";
import { cn } from "@/lib/utils";
import type { RunningSubagent } from "./extract-subagents";
import { SubagentPixelAvatar } from "./pixel-avatar";
import { useRunningSubagents } from "./use-running-subagents";

export function SubagentStrip({ sessionId }: { sessionId: string | null }) {
	const running = useRunningSubagents(sessionId);
	const { active, setFilter, clearFilter } = useSubagentFilter(sessionId);

	// Keep the last non-empty list mounted through the collapse transition so
	// chips slide out with content rather than snapping to empty.
	const lastNonEmptyRef = useRef<RunningSubagent[]>(running);
	if (running.length > 0) {
		lastNonEmptyRef.current = running;
	}
	const open = running.length > 0;
	const display = open ? running : lastNonEmptyRef.current;

	return (
		<div
			data-testid="subagent-strip"
			aria-hidden={!open}
			className={cn(
				// Full width so the strip reads as the composer extending upward,
				// not an inset banner. `rounded-t-xl` + sidebar surface match the
				// composer root (`rounded-xl bg-sidebar`).
				"pointer-events-none grid w-full transition-all duration-300 ease-out",
				open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
			)}
		>
			<div className="overflow-hidden">
				{/* translate-y-px closes the hairline seam: the overlay only overlaps
				    the composer by 1px, so we push the (border-less) bottom edge down
				    to sit flush over the composer's top border. */}
				<div className="pointer-events-auto flex translate-y-px flex-wrap items-center gap-1.5 rounded-t-xl border border-b-0 border-border/70 bg-sidebar px-2.5 pb-2 pt-1.5 dark:border-border/40">
					<span className="select-none pl-0.5 text-mini font-medium uppercase tracking-wide text-muted-foreground/60">
						Running
					</span>
					{display.map((agent) => {
						const isActive = active?.key === agent.key;
						return (
							<button
								key={agent.key}
								type="button"
								disabled={!open}
								onClick={() =>
									isActive
										? clearFilter()
										: setFilter({ key: agent.key, name: agent.name })
								}
								aria-pressed={isActive}
								className={cn(
									"flex cursor-pointer items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2.5 text-small font-medium transition-colors",
									isActive
										? "border-foreground/25 bg-background text-foreground"
										: "border-border/60 bg-background/50 text-muted-foreground hover:bg-background hover:text-foreground",
								)}
							>
								<span className="relative flex shrink-0">
									<SubagentPixelAvatar
										seedKey={agent.key}
										color={agent.color}
										size={16}
										className="shrink-0 rounded-[4px]"
									/>
									<span
										className="absolute -right-0.5 -top-0.5 flex size-1.5"
										aria-hidden
									>
										<span
											className="absolute inline-flex size-full animate-ping rounded-full opacity-70"
											style={{ backgroundColor: agent.color }}
										/>
										<span
											className="relative inline-flex size-1.5 rounded-full ring-1 ring-sidebar"
											style={{ backgroundColor: agent.color }}
										/>
									</span>
								</span>
								<span className="max-w-[12rem] truncate">{agent.name}</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
