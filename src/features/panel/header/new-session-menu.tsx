import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Plus } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { AgentProviderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import {
	SESSION_PROVIDER_CATALOG,
	type SessionProviderCatalogEntry,
	type SessionProviderGroup,
} from "@/features/terminal/terminal-agent-catalog";
import {
	type AgentCliStatus,
	type AgentModelSection,
	getAgentCliStatus,
} from "@/lib/api";
import {
	agentModelSectionsQueryOptions,
	helmorQueryKeys,
} from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useShellEvent } from "@/shell/event-bus";
import type { SessionActionsController } from "./use-session-actions";

type NewSessionMenuProps = {
	sessionActions: SessionActionsController;
	newSessionShortcut?: string | null;
	newSessionMenuShortcut?: string | null;
	disabled?: boolean;
};

const GROUP_LABELS: Record<SessionProviderCatalogEntry["group"], string> = {
	hybrid: "Chat + CLI",
	guiOnly: "Chat only",
	terminalOnly: "Terminal CLIs",
};
const GROUP_ORDER: readonly SessionProviderGroup[] = [
	"hybrid",
	"guiOnly",
	"terminalOnly",
];

export function NewSessionMenu({
	sessionActions,
	newSessionShortcut,
	newSessionMenuShortcut,
	disabled = false,
}: NewSessionMenuProps) {
	const [open, setOpen] = useState(false);
	const cliStatusQuery = useQuery({
		queryKey: helmorQueryKeys.agentCliStatus,
		queryFn: getAgentCliStatus,
		staleTime: 30_000,
	});
	const modelSectionsQuery = useQuery(agentModelSectionsQueryOptions());
	const statusByProvider = useMemo(() => {
		const map = new Map<string, AgentCliStatus>();
		for (const status of cliStatusQuery.data ?? []) {
			map.set(status.provider, status);
		}
		return map;
	}, [cliStatusQuery.data]);
	// Providers that currently expose at least one model in the (already
	// filtered) composer catalog. A section only carries options when the
	// provider is connected AND the user has enabled ≥1 model, so membership
	// here means "connected with a usable model".
	const providersWithModels = useMemo(() => {
		const set = new Set<string>();
		for (const section of modelSectionsQuery.data ?? []) {
			if (section.options.length > 0) set.add(section.id);
		}
		return set;
	}, [modelSectionsQuery.data]);
	const visibleEntriesByGroup = useMemo(() => {
		const groups = new Map<
			SessionProviderGroup,
			SessionProviderCatalogEntry[]
		>();
		for (const group of GROUP_ORDER) groups.set(group, []);
		for (const entry of SESSION_PROVIDER_CATALOG) {
			if (
				!entryVisible(
					entry,
					statusByProvider.get(entry.key) ?? null,
					providersWithModels.has(entry.key),
				)
			) {
				continue;
			}
			groups.get(entry.group)?.push(entry);
		}
		return groups;
	}, [statusByProvider, providersWithModels]);
	const visibleGroups = GROUP_ORDER.filter(
		(group) => (visibleEntriesByGroup.get(group)?.length ?? 0) > 0,
	);

	useShellEvent("open-new-session-menu", () => {
		if (!disabled) setOpen(true);
	});

	const createNormal = () => {
		void sessionActions.createSession();
		setOpen(false);
	};
	const createProvider = (entry: SessionProviderCatalogEntry) => {
		if (entry.group === "terminalOnly") {
			void sessionActions.createSession({
				sessionKind: "terminal",
				agentType: entry.key,
			});
			setOpen(false);
			return;
		}
		// Both "Chat + CLI" (hybrid) and "Chat only" (guiOnly) providers open a
		// GUI session with that provider's first model pre-selected in the model
		// selector. Falls back to null when the provider has no models configured.
		const model = firstModelIdForProvider(
			modelSectionsQuery.data ?? [],
			entry.key,
		);
		void sessionActions.createSession({
			sessionKind: "gui",
			agentType: entry.key,
			model,
		});
		setOpen(false);
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					aria-label="New session"
					disabled={disabled}
					variant="ghost"
					size="icon-sm"
					className="ml-0.5 shrink-0 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
				>
					<Plus className="size-3.5" strokeWidth={1.8} />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72 p-1.5">
				<DropdownMenuItem
					onSelect={createNormal}
					className="items-center gap-2.5 py-1.5"
				>
					<MenuTile>
						<MessageCircle className="size-3.5" strokeWidth={1.8} />
					</MenuTile>
					<span className="min-w-0 flex-1 font-medium">
						Normal chat session
					</span>
					{newSessionShortcut ? (
						<InlineShortcutDisplay
							hotkey={newSessionShortcut}
							className="text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground"
						/>
					) : null}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{visibleGroups.map((group, index) => {
					const entries = visibleEntriesByGroup.get(group) ?? [];
					return (
						<div key={group}>
							<DropdownMenuLabel className="px-2 pt-1.5 pb-1 uppercase tracking-[0.06em] text-muted-foreground/70">
								{GROUP_LABELS[group]}
							</DropdownMenuLabel>
							{entries.map((entry) => (
								<ProviderMenuItem
									key={entry.key}
									entry={entry}
									status={statusByProvider.get(entry.key) ?? null}
									onCreate={() => createProvider(entry)}
								/>
							))}
							{index < visibleGroups.length - 1 ? (
								<DropdownMenuSeparator />
							) : null}
						</div>
					);
				})}
				{newSessionMenuShortcut ? (
					<>
						<DropdownMenuSeparator />
						<div className="flex items-center gap-1 px-2 pt-0.5 pb-1 text-mini text-muted-foreground/70">
							Open this menu with{" "}
							<InlineShortcutDisplay hotkey={newSessionMenuShortcut} />
						</div>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function entryVisible(
	entry: SessionProviderCatalogEntry,
	status: AgentCliStatus | null,
	hasModel: boolean,
): boolean {
	// "Chat only" providers (Cursor, Copilot, Kimi) have no terminal CLI to
	// fall back on, so they are only useful once connected with at least one
	// model selected — which is exactly when the composer catalog exposes a
	// non-empty section for them.
	if (entry.group === "guiOnly") return hasModel;
	if (!entry.binary) return true;
	return Boolean(status && status.source !== "missing");
}

function firstModelIdForProvider(
	sections: readonly AgentModelSection[],
	provider: string,
): string | null {
	const section = sections.find((section) => section.id === provider);
	const option =
		section?.options[0] ??
		sections
			.flatMap((section) => section.options)
			.find((option) => option.provider === provider);
	return option?.id ?? null;
}

// Rounded brand-icon tile shared by every row — gives the menu a launcher feel
// and keeps icons optically aligned regardless of their intrinsic glyph weight.
function MenuTile({ children }: { children: ReactNode }) {
	return (
		<span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground transition-colors group-focus/dropdown-menu-item:border-transparent group-focus/dropdown-menu-item:bg-foreground/10">
			{children}
		</span>
	);
}

function ProviderMenuItem({
	entry,
	status,
	onCreate,
}: {
	entry: SessionProviderCatalogEntry;
	status: AgentCliStatus | null;
	onCreate: () => void;
}) {
	const meta = statusMeta(status, entry);

	return (
		<DropdownMenuItem
			onSelect={onCreate}
			className="items-center gap-2.5 py-1.5"
		>
			<MenuTile>
				<AgentProviderIcon agentType={entry.key} className="size-3.5" />
			</MenuTile>
			<span className="min-w-0 flex-1">
				<span className="block truncate font-medium">{entry.label}</span>
				<span
					className={cn(
						"block truncate text-mini",
						meta.muted
							? "text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground/80"
							: "text-foreground group-focus/dropdown-menu-item:text-accent-foreground",
					)}
				>
					{meta.text}
				</span>
			</span>
		</DropdownMenuItem>
	);
}

function statusMeta(
	status: AgentCliStatus | null,
	entry: SessionProviderCatalogEntry,
): { text: string; muted: boolean } {
	if (entry.group === "guiOnly") return { text: "Chat UI", muted: true };
	if (!status) return { text: entry.binary ?? "Chat UI", muted: true };
	if (status.source === "bundled") {
		return {
			text: `Bundled${status.version ? ` v${status.version}` : ""}`,
			muted: true,
		};
	}
	if (status.source === "external") {
		return {
			text: `External${status.version ? ` v${status.version}` : ""}`,
			muted: true,
		};
	}
	if (status.source === "missing")
		return { text: "Not installed", muted: false };
	return { text: "Configured in app", muted: true };
}
