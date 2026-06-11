import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ModelIcon } from "@/components/model-icon";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import {
	type AgentModelSection,
	createTerminalSession,
	type TerminalAgentInfo,
} from "@/lib/api";
import {
	agentModelSectionsQueryOptions,
	terminalAgentsQueryOptions,
} from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";
import { publishShellEvent, useShellEvent } from "@/shell/event-bus";
import { seedNewSessionInCache } from "../panel/session-cache";
import { terminalAgentIconByKey } from "./agent-meta";

type LauncherTab = "conversation" | "terminal";

type NewSessionPopoverProps = {
	workspaceId: string | null;
	/** Hotkey label for the Conversation tab/tooltip (e.g. "Mod+T"). */
	conversationShortcut?: string | null;
	/** Hotkey label for the Terminal tab (e.g. "Mod+Shift+T"). */
	terminalShortcut?: string | null;
	/** Plain "new conversation" action — owned by the panel header. Optional
	 * `model` seeds the new session's harness/model. */
	onCreateConversation: (model?: string) => void;
	onSelectSession?: (sessionId: string) => void;
	onSessionsChanged?: () => void;
};

function agentRank(agent: TerminalAgentInfo): number {
	return agent.firstClass ? 0 : 1;
}

function TabButton({
	active,
	label,
	shortcut,
	onClick,
}: {
	active: boolean;
	label: string;
	shortcut?: string | null;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-b-2 px-2 py-1.5 text-small",
				active
					? "border-foreground text-foreground"
					: "border-transparent text-muted-foreground hover:text-foreground",
			)}
		>
			<span>{label}</span>
			{shortcut ? (
				<InlineShortcutDisplay hotkey={shortcut} className="opacity-60" />
			) : null}
		</button>
	);
}

/** Single launcher: a Plus button that opens a tabbed popover for starting a
 * conversation or a terminal session. Replaces the old Plus + chevron dropdown
 * pair. Opens on click or on the `open-new-session` shell event (fired by the
 * `session.newTerminal` global shortcut). */
export function NewSessionPopover({
	workspaceId,
	conversationShortcut,
	terminalShortcut,
	onCreateConversation,
	onSelectSession,
	onSessionsChanged,
}: NewSessionPopoverProps) {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<LauncherTab>("conversation");
	const [highlight, setHighlight] = useState(0);
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();

	useShellEvent("open-new-session", (event) => {
		setTab(event.tab ?? "conversation");
		setHighlight(0);
		setOpen(true);
	});

	const agentsQuery = useQuery({
		...terminalAgentsQueryOptions(),
		enabled: open,
	});
	const installed = (agentsQuery.data ?? [])
		.filter((agentInfo) => agentInfo.installed)
		.sort((a, b) => agentRank(a) - agentRank(b));

	const modelSectionsQuery = useQuery({
		...agentModelSectionsQueryOptions(),
		enabled: open,
	});
	const harnesses: AgentModelSection[] = (modelSectionsQuery.data ?? []).filter(
		(section) => section.status === "ready" && section.options.length > 0,
	);

	const activeListLength =
		tab === "conversation" ? harnesses.length : installed.length;
	useEffect(() => {
		setHighlight((current) =>
			activeListLength === 0 ? 0 : Math.min(current, activeListLength - 1),
		);
	}, [activeListLength]);

	const startConversation = (model?: string) => {
		setOpen(false);
		onCreateConversation(model);
	};

	const startTerminal = async (agent: TerminalAgentInfo) => {
		if (!workspaceId) return;
		setOpen(false);
		try {
			const { sessionId } = await createTerminalSession(workspaceId, agent.id);
			// Optimistically seed the cache (same as the conversation flow) so the
			// new terminal session is present + marked active immediately. Without
			// this, the panel's reconciliation effect resolves the displayed
			// session from the stale active pointer and yanks selection back to the
			// previously-active tab before the async refetch lands — leaving the
			// new tab created but not focused.
			seedNewSessionInCache({
				queryClient,
				workspaceId,
				sessionId,
				sessionKind: "terminal",
				agentType: agent.id,
			});
			onSessionsChanged?.();
			onSelectSession?.(sessionId);
		} catch (error) {
			console.error("Failed to create terminal session:", error);
			pushToast(
				error instanceof Error
					? error.message
					: "Could not start the terminal session",
				"Terminal session failed",
				"destructive",
			);
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			event.preventDefault();
			setTab((current) =>
				current === "conversation" ? "terminal" : "conversation",
			);
			return;
		}
		if (tab === "conversation") {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setHighlight((current) =>
					Math.max(0, Math.min(harnesses.length - 1, current + 1)),
				);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setHighlight((current) => Math.max(0, current - 1));
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				const section = harnesses[highlight];
				if (section) startConversation(section.options[0]?.id);
				else startConversation();
				return;
			}
			if (/^[1-9]$/.test(event.key)) {
				const section = harnesses[Number(event.key) - 1];
				if (section) {
					event.preventDefault();
					startConversation(section.options[0]?.id);
				}
			}
			return;
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setHighlight((current) =>
				Math.max(0, Math.min(installed.length - 1, current + 1)),
			);
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setHighlight((current) => Math.max(0, current - 1));
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			const agent = installed[highlight];
			if (agent) void startTerminal(agent);
			return;
		}
		if (/^[1-9]$/.test(event.key)) {
			const agent = installed[Number(event.key) - 1];
			if (agent) {
				event.preventDefault();
				void startTerminal(agent);
			}
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							aria-label="New session"
							variant="ghost"
							size="icon-sm"
							className="ml-0.5 shrink-0 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
						>
							<Plus className="size-3.5" strokeWidth={1.8} />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent
					side="bottom"
					sideOffset={4}
					className="flex h-[24px] items-center gap-2 rounded-md px-2 text-small leading-none"
				>
					<span>New session</span>
					{conversationShortcut ? (
						<InlineShortcutDisplay
							hotkey={conversationShortcut}
							className="text-background/60"
						/>
					) : null}
				</TooltipContent>
			</Tooltip>
			<PopoverContent
				align="end"
				sideOffset={4}
				className="w-64 p-0"
				onKeyDown={handleKeyDown}
			>
				<div className="flex border-border/60 border-b">
					<TabButton
						active={tab === "conversation"}
						label="Conversation"
						shortcut={conversationShortcut}
						onClick={() => setTab("conversation")}
					/>
					<TabButton
						active={tab === "terminal"}
						label="Terminal"
						shortcut={terminalShortcut}
						onClick={() => setTab("terminal")}
					/>
				</div>

				{tab === "conversation" ? (
					<div className="p-1">
						{modelSectionsQuery.isPending ? (
							<div className="px-2 py-1.5 text-small text-muted-foreground">
								Detecting harnesses…
							</div>
						) : harnesses.length === 0 ? (
							<button
								type="button"
								onClick={() => startConversation()}
								className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-small hover:bg-accent/60"
							>
								<MessageSquare className="size-3.5 shrink-0" />
								New conversation
							</button>
						) : (
							harnesses.map((section, index) => {
								const quickKey = index < 9 ? String(index + 1) : null;
								return (
									<button
										key={section.id}
										type="button"
										onClick={() => startConversation(section.options[0]?.id)}
										onMouseEnter={() => setHighlight(index)}
										data-highlighted={index === highlight ? "" : undefined}
										className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-small hover:bg-accent/60 data-[highlighted]:bg-accent/60"
									>
										<ModelIcon
											model={section.options[0]}
											className="size-3.5 shrink-0"
										/>
										<span className="min-w-0 flex-1 truncate text-left">
											{section.label}
										</span>
										{quickKey ? (
											<kbd className="shrink-0 rounded-sm border border-border/70 bg-background px-1 text-[10px] text-muted-foreground">
												{quickKey}
											</kbd>
										) : null}
									</button>
								);
							})
						)}
					</div>
				) : (
					<div className="p-1">
						{agentsQuery.isPending ? (
							<div className="px-2 py-1.5 text-small text-muted-foreground">
								Detecting agents…
							</div>
						) : installed.length === 0 ? (
							<div className="px-2 py-1.5 text-small text-muted-foreground">
								No terminal agents detected
							</div>
						) : (
							installed.map((agent, index) => {
								const Icon = terminalAgentIconByKey(agent.iconKey);
								const quickKey = index < 9 ? String(index + 1) : null;
								return (
									<button
										key={agent.id}
										type="button"
										onClick={() => void startTerminal(agent)}
										onMouseEnter={() => setHighlight(index)}
										data-highlighted={index === highlight ? "" : undefined}
										className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-small hover:bg-accent/60 data-[highlighted]:bg-accent/60"
									>
										<Icon className="size-3.5 shrink-0" />
										<span className="min-w-0 flex-1 truncate text-left">
											{agent.displayName}
										</span>
										{quickKey ? (
											<kbd className="shrink-0 rounded-sm border border-border/70 bg-background px-1 text-[10px] text-muted-foreground">
												{quickKey}
											</kbd>
										) : null}
									</button>
								);
							})
						)}
						<div className="my-1 border-border/60 border-t" />
						<button
							type="button"
							onClick={() => {
								setOpen(false);
								publishShellEvent({
									type: "open-settings",
									section: "terminal-agents",
								});
							}}
							className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-small text-muted-foreground hover:bg-accent/60"
						>
							<Settings2 className="size-3.5 shrink-0" />
							Manage terminal agents…
						</button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
