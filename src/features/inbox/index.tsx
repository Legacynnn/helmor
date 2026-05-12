import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { GithubBrandIcon, GitlabBrandIcon } from "@/components/brand-icon";
import { TrafficLightSpacer } from "@/components/chrome/traffic-light-spacer";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LinearTeamPicker } from "@/features/tasks/components/linear-team-picker";
import {
	type ForgeProvider,
	type InboxKindLabels,
	type LinearAuthStatus,
	type LinearIssue,
	type LinearIssueState,
	linearGetAuthStatus,
	linearListTasks,
	type RepositoryCreateOption,
} from "@/lib/api";
import type { ComposerInsertTarget } from "@/lib/composer-insert";
import { forgeLabelsFor } from "@/lib/forge-labels";
import { parseForgeRepoHost } from "@/lib/forge-repo-filter";
import {
	helmorQueryKeys,
	inboxKindLabelsQueryOptions,
} from "@/lib/query-client";
import {
	DEFAULT_INBOX_ACCOUNT_TOGGLES,
	type InboxAccountSourceToggles,
	useSettings,
} from "@/lib/settings";
import type {
	ContextCard,
	ContextCardSource,
	ContextCardStateTone,
} from "@/lib/sources/types";
import { useForgeAccountsAll } from "@/lib/use-forge-accounts";
import { cn } from "@/lib/utils";
import { SourceCard } from "./source-card";
import { SourceIcon } from "./source-icon";
import {
	type InboxItemWithDetailRef,
	type InboxKind,
	useInboxItems,
} from "./use-inbox-items";

/** Forge providers that have an inbox backend implementation. Used to
 *  narrow `repository.forgeProvider` (which can also be "unknown"). */
type ForgeFilterId = "github" | "gitlab";

type SourceFilterId = ForgeFilterId | "linear";

/** Matches the constant in App.tsx — keep these in sync. */
const OPEN_SETTINGS_EVENT = "helmor:open-settings";

function openInboxSettings() {
	window.dispatchEvent(
		new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { section: "inbox" } }),
	);
}

function openLinearSettings() {
	window.dispatchEvent(
		new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { section: "linear" } }),
	);
}

type ForgeStateFilterId = "all" | "open" | "closed";

type ForgeStateFilter = {
	id: ForgeStateFilterId;
	label: string;
};

const ISSUE_STATE_FILTERS: ForgeStateFilter[] = [
	{ id: "all", label: "All" },
	{ id: "open", label: "Open" },
	{ id: "closed", label: "Closed" },
];

type LinearStateFilterId = "all" | "open" | "closed";

const LINEAR_STATE_FILTERS: { id: LinearStateFilterId; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "open", label: "Open" },
	{ id: "closed", label: "Closed" },
];

/** If the user pastes a forge issue URL into the search box, the search
 *  still applies — but we no longer auto-switch sub-types because there
 *  is only one sub-type (issues) now. */
export function forgeFilterIdForRepo(
	repository: RepositoryCreateOption | null,
): ForgeFilterId {
	const provider: ForgeProvider | null | undefined = repository?.forgeProvider;
	if (provider === "gitlab") return "gitlab";
	return "github";
}

function useDebouncedValue<T>(value: T, delayMs: number) {
	const [debouncedValue, setDebouncedValue] = useState(value);
	useEffect(() => {
		const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
		return () => window.clearTimeout(timer);
	}, [value, delayMs]);
	return debouncedValue;
}

export const InboxSidebar = memo(function InboxSidebar({
	className,
	onOpenCard,
	selectedCardId,
	repository,
	repoFilter,
	providerTab,
	onProviderTabChange,
	stateFilterBySource,
	onStateFilterBySourceChange,
	appendContextTarget,
	showWindowSafeTop = true,
}: {
	className?: string;
	onOpenCard?: (card: ContextCard) => void;
	selectedCardId?: string | null;
	appendContextTarget?: ComposerInsertTarget;
	showWindowSafeTop?: boolean;
	repository?: RepositoryCreateOption | null;
	repoFilter?: string | null;
	/** Controlled top-level provider tab id. "github"/"gitlab" follows the
	 *  project's forge; "linear" is the Linear tasks tab. The other historic
	 *  values are mapped onto the forge tab so persisted state from older
	 *  builds doesn't crash. */
	providerTab?: SourceFilterId;
	onProviderTabChange?: (tab: SourceFilterId) => void;
	/** Reserved for backwards-compat — sub-tabs were removed but keeping
	 *  the prop signature stable for App.tsx. */
	providerSourceTab?: InboxKind;
	onProviderSourceTabChange?: (tab: InboxKind) => void;
	stateFilterBySource?: Record<string, string>;
	onStateFilterBySourceChange?: (filters: Record<string, string>) => void;
}) {
	const projectForgeId = forgeFilterIdForRepo(repository ?? null);

	const normalizedProviderTab: SourceFilterId | undefined =
		providerTab === "linear"
			? "linear"
			: providerTab === "github" || providerTab === "gitlab"
				? providerTab
				: undefined;

	const [internalSelectedSource, setInternalSelectedSource] =
		useState<SourceFilterId>(normalizedProviderTab ?? projectForgeId);
	const selectedSource = normalizedProviderTab ?? internalSelectedSource;
	const setSelectedSource = (next: SourceFilterId) => {
		setInternalSelectedSource(next);
		onProviderTabChange?.(next);
	};

	const visibleSourceFilters = useMemo<SourceFilterId[]>(
		() => [projectForgeId, "linear"],
		[projectForgeId],
	);

	// If repo's forge flips and the current selection is the other forge,
	// snap to the project's forge. Linear stays pinned through repo switches.
	useEffect(() => {
		if (selectedSource === "linear") return;
		if (selectedSource === projectForgeId) return;
		setInternalSelectedSource(projectForgeId);
		onProviderTabChange?.(projectForgeId);
	}, [projectForgeId, selectedSource, onProviderTabChange]);

	const [searchQuery, setSearchQuery] = useState("");
	const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);

	const isForgeSource =
		selectedSource === "github" || selectedSource === "gitlab";
	const isLinearSource = selectedSource === "linear";
	const activeForgeProvider: ForgeFilterId = isForgeSource
		? (selectedSource as ForgeFilterId)
		: projectForgeId;
	const activeForgeLabels = forgeLabelsFor(activeForgeProvider);

	const horizontalPaddingClass = showWindowSafeTop
		? "pr-4 pl-3"
		: "pr-3 pl-2.5";
	const providerTabsCompact = !showWindowSafeTop;

	return (
		<div className={cn("h-full min-h-0 flex-col overflow-hidden", className)}>
			{showWindowSafeTop ? (
				<div
					data-slot="window-safe-top"
					className="flex h-9 shrink-0 items-center pr-3"
				>
					<TrafficLightSpacer side="left" width={94} />
					<div data-tauri-drag-region className="h-full flex-1" />
				</div>
			) : null}

			<div
				className={cn(
					horizontalPaddingClass,
					showWindowSafeTop ? "-mt-1" : "pt-1",
				)}
			>
				<div
					className={cn(
						"grid w-full border border-border/60 bg-background/40",
						providerTabsCompact
							? "gap-0.5 rounded-md p-0.5"
							: "gap-1 rounded-lg p-1",
					)}
					style={{
						gridTemplateColumns: `repeat(${visibleSourceFilters.length}, minmax(0, 1fr))`,
					}}
				>
					{visibleSourceFilters.map((filterId) => {
						const tabLabel =
							filterId === "github" || filterId === "gitlab"
								? `${forgeLabelsFor(filterId).providerName} issues`
								: "Linear tasks";
						return (
							<button
								key={filterId}
								type="button"
								aria-label={tabLabel}
								aria-pressed={selectedSource === filterId}
								title={tabLabel}
								onClick={() => setSelectedSource(filterId)}
								className={cn(
									"relative flex cursor-pointer items-center justify-center text-muted-foreground transition-[background-color,color,box-shadow]",
									providerTabsCompact ? "h-6 rounded-[5px]" : "h-7 rounded-md",
									"hover:bg-accent/60 hover:text-foreground",
									selectedSource === filterId &&
										"bg-accent text-foreground shadow-xs",
								)}
							>
								<span className="relative inline-flex">
									{filterId === "github" ? (
										<GithubBrandIcon size={providerTabsCompact ? 13 : 14} />
									) : filterId === "gitlab" ? (
										<GitlabBrandIcon size={providerTabsCompact ? 13 : 14} />
									) : (
										<SourceIcon
											source="linear"
											size={providerTabsCompact ? 13 : 14}
										/>
									)}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			{isForgeSource ? (
				<ForgeIssuesPane
					provider={activeForgeProvider}
					providerLabel={activeForgeLabels.providerName}
					repository={repository ?? null}
					repoFilter={repoFilter ?? null}
					searchQuery={searchQuery}
					debouncedSearchQuery={debouncedSearchQuery}
					onSearchChange={setSearchQuery}
					stateFilterBySource={stateFilterBySource}
					onStateFilterBySourceChange={onStateFilterBySourceChange}
					horizontalPaddingClass={horizontalPaddingClass}
					selectedCardId={selectedCardId ?? null}
					onOpenCard={onOpenCard}
					appendContextTarget={appendContextTarget}
				/>
			) : isLinearSource ? (
				<LinearTasksPane
					repository={repository ?? null}
					searchQuery={searchQuery}
					debouncedSearchQuery={debouncedSearchQuery}
					onSearchChange={setSearchQuery}
					stateFilterBySource={stateFilterBySource}
					onStateFilterBySourceChange={onStateFilterBySourceChange}
					horizontalPaddingClass={horizontalPaddingClass}
					selectedCardId={selectedCardId ?? null}
					onOpenCard={onOpenCard}
					appendContextTarget={appendContextTarget}
				/>
			) : null}
		</div>
	);
});

// ────────────────────────────────────────────────────────────────────────────
// Forge issues pane
// ────────────────────────────────────────────────────────────────────────────

function ForgeIssuesPane({
	provider,
	providerLabel,
	repository,
	repoFilter,
	searchQuery,
	debouncedSearchQuery,
	onSearchChange,
	stateFilterBySource,
	onStateFilterBySourceChange,
	horizontalPaddingClass,
	selectedCardId,
	onOpenCard,
	appendContextTarget,
}: {
	provider: ForgeFilterId;
	providerLabel: string;
	repository: RepositoryCreateOption | null;
	repoFilter: string | null;
	searchQuery: string;
	debouncedSearchQuery: string;
	onSearchChange: (next: string) => void;
	stateFilterBySource?: Record<string, string>;
	onStateFilterBySourceChange?: (filters: Record<string, string>) => void;
	horizontalPaddingClass: string;
	selectedCardId: string | null;
	onOpenCard?: (card: ContextCard) => void;
	appendContextTarget?: ComposerInsertTarget;
}) {
	const inboxKind: InboxKind = "issues";
	const kindLabelsQuery = useQuery(inboxKindLabelsQueryOptions(provider));
	const kindLabels: InboxKindLabels[] = kindLabelsQuery.data ?? [];
	const activeKindLabels: InboxKindLabels | null =
		kindLabels.find((entry) => entry.kind === inboxKind) ?? null;

	const accountsQuery = useForgeAccountsAll();
	const { settings } = useSettings();
	const primaryForgeAccount = useMemo(
		() => (accountsQuery.data ?? []).find((a) => a.provider === provider),
		[accountsQuery.data, provider],
	);
	const hasForgeAccount = Boolean(primaryForgeAccount);
	const currentInboxToggles: InboxAccountSourceToggles = useMemo(() => {
		if (!primaryForgeAccount) return DEFAULT_INBOX_ACCOUNT_TOGGLES;
		const key = `${primaryForgeAccount.provider}:${primaryForgeAccount.login}`;
		return (
			settings.inboxSourceConfig?.accounts?.[key] ??
			DEFAULT_INBOX_ACCOUNT_TOGGLES
		);
	}, [primaryForgeAccount, settings.inboxSourceConfig]);

	const stateFilter =
		(stateFilterBySource?.[inboxKind] as ForgeStateFilterId | undefined) ??
		(currentInboxToggles.issueState as ForgeStateFilterId | undefined) ??
		"all";
	const setStateFilter = (next: ForgeStateFilterId) => {
		onStateFilterBySourceChange?.({
			...(stateFilterBySource ?? {}),
			[inboxKind]: next,
		});
	};
	const activeStateFilter =
		ISSUE_STATE_FILTERS.find((filter) => filter.id === stateFilter) ??
		ISSUE_STATE_FILTERS[0];

	const trimmedSearchQuery = debouncedSearchQuery.trim();
	const inboxFilters = useMemo(
		() => ({
			query: trimmedSearchQuery || null,
			state: activeStateFilter.id === "all" ? null : activeStateFilter.id,
		}),
		[activeStateFilter.id, trimmedSearchQuery],
	);

	const inboxHost = useMemo(
		() => parseForgeRepoHost(repository ?? null),
		[repository],
	);
	const inbox = useInboxItems(
		inboxKind,
		repoFilter ?? null,
		inboxFilters,
		provider,
		inboxHost,
	);
	const filteredCards = useMemo<ContextCard[]>(
		() => inbox.items.map(inboxItemToContextCard),
		[inbox.items],
	);

	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const sentinelRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (!inbox.hasNextPage || inbox.isFetchingNextPage) return;
		const el = sentinelRef.current;
		if (!el) return;
		const root = scrollContainerRef.current;
		if (!root) return;
		if (root.scrollHeight <= root.clientHeight + 1) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						inbox.fetchNextPage();
						break;
					}
				}
			},
			{ root, rootMargin: "120px 0px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [
		inbox.hasNextPage,
		inbox.isFetchingNextPage,
		inbox.fetchNextPage,
		filteredCards.length,
	]);

	return (
		<>
			<div className={cn("mt-1.5", horizontalPaddingClass)}>
				<div className="flex h-7 min-w-0 items-center gap-1.5">
					<SearchBox
						value={searchQuery}
						onChange={onSearchChange}
						placeholder="Search"
						ariaLabel={`Search ${providerLabel} issues`}
					/>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border/45 bg-background/35 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/45 hover:text-foreground"
							>
								<span>{activeStateFilter.label}</span>
								<ChevronDown className="size-3" strokeWidth={2} />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-28">
							<DropdownMenuRadioGroup
								value={activeStateFilter.id}
								onValueChange={(value) =>
									setStateFilter(value as ForgeStateFilterId)
								}
							>
								{ISSUE_STATE_FILTERS.map((filter) => (
									<DropdownMenuRadioItem
										key={filter.id}
										value={filter.id}
										className="text-[11px]"
									>
										{filter.label}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<ScrollList
				scrollContainerRef={scrollContainerRef}
				horizontalPaddingClass={horizontalPaddingClass}
				topMarginClass="mt-1"
			>
				{!hasForgeAccount ? (
					<ConnectForgeState
						provider={provider}
						onConfigure={openInboxSettings}
					/>
				) : !inbox.kindEnabled ? (
					<KindDisabledState
						labels={activeKindLabels}
						onConfigure={openInboxSettings}
					/>
				) : inbox.error ? (
					<InboxErrorState error={inbox.error} onRetry={inbox.refetch} />
				) : !inbox.hasResolved ? (
					<InboxLoadingState />
				) : filteredCards.length > 0 ? (
					<>
						<div className="flex w-full flex-col gap-2">
							{filteredCards.map((card, index) => (
								<div key={card.id} data-index={index}>
									<SourceCard
										card={card}
										selected={card.id === selectedCardId}
										onOpen={onOpenCard}
										appendContextTarget={appendContextTarget}
									/>
								</div>
							))}
						</div>
						{inbox.hasNextPage ? (
							<div
								ref={sentinelRef}
								aria-hidden="true"
								className="flex h-8 w-full shrink-0 items-center justify-center text-muted-foreground/60"
							>
								{inbox.isFetchingNextPage ? (
									<Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
								) : null}
							</div>
						) : null}
					</>
				) : (
					<NoItemsState
						labels={activeKindLabels}
						repoFilter={repoFilter ?? null}
					/>
				)}
			</ScrollList>
		</>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Linear tasks pane
// ────────────────────────────────────────────────────────────────────────────

const LINEAR_STATE_KEY = "linear";

function LinearTasksPane({
	repository,
	searchQuery,
	debouncedSearchQuery,
	onSearchChange,
	stateFilterBySource,
	onStateFilterBySourceChange,
	horizontalPaddingClass,
	selectedCardId,
	onOpenCard,
	appendContextTarget,
}: {
	repository: RepositoryCreateOption | null;
	searchQuery: string;
	debouncedSearchQuery: string;
	onSearchChange: (next: string) => void;
	stateFilterBySource?: Record<string, string>;
	onStateFilterBySourceChange?: (filters: Record<string, string>) => void;
	horizontalPaddingClass: string;
	selectedCardId: string | null;
	onOpenCard?: (card: ContextCard) => void;
	appendContextTarget?: ComposerInsertTarget;
}) {
	const authQuery = useQuery<LinearAuthStatus>({
		queryKey: ["linear", "auth-status"],
		queryFn: linearGetAuthStatus,
		staleTime: 60_000,
	});

	const linearTeamId = repository?.linearTeamId ?? null;
	const tasksQuery = useQuery<LinearIssue[]>({
		queryKey: linearTeamId
			? helmorQueryKeys.tasks.linear(repository?.id ?? "", linearTeamId)
			: ["tasks", "linear", "disabled"],
		queryFn: () => linearListTasks(linearTeamId as string),
		enabled: Boolean(linearTeamId) && authQuery.data?.connected !== false,
		staleTime: 60_000,
	});

	const stateFilter =
		(stateFilterBySource?.[LINEAR_STATE_KEY] as
			| LinearStateFilterId
			| undefined) ?? "all";
	const setStateFilter = (next: LinearStateFilterId) => {
		onStateFilterBySourceChange?.({
			...(stateFilterBySource ?? {}),
			[LINEAR_STATE_KEY]: next,
		});
	};
	const activeStateFilter =
		LINEAR_STATE_FILTERS.find((filter) => filter.id === stateFilter) ??
		LINEAR_STATE_FILTERS[0];

	const trimmedSearchQuery = debouncedSearchQuery.trim().toLowerCase();
	const cards = useMemo<ContextCard[]>(() => {
		const issues = tasksQuery.data ?? [];
		const filtered = issues.filter((issue) => {
			const tone = linearStateTone(issue.state);
			if (activeStateFilter.id === "open" && tone === "closed") return false;
			if (activeStateFilter.id === "closed" && tone !== "closed") return false;
			if (trimmedSearchQuery) {
				const haystack = `${issue.title} ${issue.identifier}`.toLowerCase();
				if (!haystack.includes(trimmedSearchQuery)) return false;
			}
			return true;
		});
		return filtered.map(linearIssueToContextCard);
	}, [tasksQuery.data, activeStateFilter.id, trimmedSearchQuery]);

	const scrollContainerRef = useRef<HTMLDivElement | null>(null);

	const body = (() => {
		if (authQuery.isLoading && !authQuery.data) {
			return <InboxLoadingState />;
		}
		if (authQuery.data && !authQuery.data.connected) {
			return <ConnectLinearState onConfigure={openLinearSettings} />;
		}
		if (!repository) {
			return <NoRepositoryState />;
		}
		if (!linearTeamId) {
			return <LinkLinearTeamState repoId={repository.id} />;
		}
		if (tasksQuery.error) {
			return (
				<InboxErrorState
					error={tasksQuery.error}
					onRetry={() => {
						void tasksQuery.refetch();
					}}
				/>
			);
		}
		if (tasksQuery.isLoading) {
			return <InboxLoadingState />;
		}
		if (cards.length === 0) {
			return <NoLinearTasksState />;
		}
		return (
			<div className="flex w-full flex-col gap-2">
				{cards.map((card, index) => (
					<div key={card.id} data-index={index}>
						<SourceCard
							card={card}
							selected={card.id === selectedCardId}
							onOpen={onOpenCard}
							appendContextTarget={appendContextTarget}
						/>
					</div>
				))}
			</div>
		);
	})();

	const showControls =
		authQuery.data?.connected !== false && Boolean(linearTeamId);

	return (
		<>
			{showControls ? (
				<div className={cn("mt-1.5", horizontalPaddingClass)}>
					<div className="flex h-7 min-w-0 items-center gap-1.5">
						<SearchBox
							value={searchQuery}
							onChange={onSearchChange}
							placeholder="Search"
							ariaLabel="Search Linear tasks"
						/>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border/45 bg-background/35 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/45 hover:text-foreground"
								>
									<span>{activeStateFilter.label}</span>
									<ChevronDown className="size-3" strokeWidth={2} />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-28">
								<DropdownMenuRadioGroup
									value={activeStateFilter.id}
									onValueChange={(value) =>
										setStateFilter(value as LinearStateFilterId)
									}
								>
									{LINEAR_STATE_FILTERS.map((filter) => (
										<DropdownMenuRadioItem
											key={filter.id}
											value={filter.id}
											className="text-[11px]"
										>
											{filter.label}
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			) : null}

			<ScrollList
				scrollContainerRef={scrollContainerRef}
				horizontalPaddingClass={horizontalPaddingClass}
				topMarginClass={showControls ? "mt-1" : "mt-[7px]"}
			>
				{body}
			</ScrollList>
		</>
	);
}

function linearStateTone(state: LinearIssueState): ContextCardStateTone {
	switch (state.type) {
		case "completed":
		case "canceled":
			return "closed";
		case "started":
			return "open";
		default:
			return "neutral";
	}
}

function linearIssueToContextCard(issue: LinearIssue): ContextCard {
	return {
		id: `linear:${issue.id}`,
		source: "linear",
		externalId: issue.identifier,
		externalUrl: issue.url,
		title: issue.title,
		state: {
			label: issue.state.name,
			tone: linearStateTone(issue.state),
		},
		lastActivityAt: Date.parse(issue.updatedAt),
		meta: {
			type: "linear",
			identifier: issue.identifier,
			priorityLabel: "",
			team: { name: "", key: "" },
			labels: issue.labels.nodes.map((l) => ({
				name: l.name,
				color: l.color,
			})),
		},
	};
}

// ────────────────────────────────────────────────────────────────────────────
// Shared UI bits
// ────────────────────────────────────────────────────────────────────────────

function SearchBox({
	value,
	onChange,
	placeholder,
	ariaLabel,
}: {
	value: string;
	onChange: (next: string) => void;
	placeholder: string;
	ariaLabel: string;
}) {
	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		onChange(event.target.value);
	};
	return (
		<div className="flex min-w-0 flex-1 items-center rounded-md border border-border/45 bg-background/35 px-1.5 text-muted-foreground transition-colors focus-within:border-border/80 focus-within:bg-background/55">
			<Search className="size-3 shrink-0" strokeWidth={1.9} />
			<input
				type="text"
				value={value}
				onChange={handleChange}
				placeholder={placeholder}
				aria-label={ariaLabel}
				className="h-6 min-w-0 flex-1 bg-transparent px-1.5 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/70"
			/>
			{value ? (
				<button
					type="button"
					aria-label="Clear search"
					onClick={() => onChange("")}
					className="flex size-4 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
				>
					<X className="size-3" strokeWidth={2} />
				</button>
			) : null}
		</div>
	);
}

function ScrollList({
	scrollContainerRef,
	horizontalPaddingClass,
	topMarginClass,
	children,
}: {
	scrollContainerRef: React.RefObject<HTMLDivElement | null>;
	horizontalPaddingClass: string;
	topMarginClass: string;
	children: React.ReactNode;
}) {
	return (
		<div
			ref={scrollContainerRef}
			className={cn(
				"scrollbar-stable min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:thin]",
				horizontalPaddingClass,
				topMarginClass,
			)}
		>
			<div className="flex w-[calc(100%+12px)] flex-col gap-2 pb-3">
				{children}
			</div>
		</div>
	);
}

function InboxLoadingState() {
	return (
		<div className="mt-8 flex flex-col items-center gap-2 px-6 text-muted-foreground/70">
			<Loader2 className="size-4 animate-spin" strokeWidth={2} />
			<div className="text-[12px] leading-5">Loading…</div>
		</div>
	);
}

function InboxErrorState({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) {
	const message =
		error instanceof Error ? error.message : "Couldn't load context items.";
	return (
		<div className="mt-8 flex flex-col items-center gap-2 px-6 text-center">
			<div className="text-[13px] font-medium text-foreground">
				Couldn't load
			</div>
			<div className="text-[12px] leading-5 text-muted-foreground">
				{message}
			</div>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={onRetry}
				className="mt-1 cursor-pointer text-[12px]"
			>
				Try again
			</Button>
		</div>
	);
}

function inboxItemToContextCard(item: InboxItemWithDetailRef): ContextCard {
	const externalId = item.externalId;
	const number = parseExternalNumber(externalId);
	const repo = parseExternalRepo(externalId);
	const baseFields = {
		id: item.id,
		source: item.source as ContextCardSource,
		externalId,
		externalUrl: item.externalUrl,
		title: item.title,
		subtitle: item.subtitle ?? undefined,
		state: item.state ?? undefined,
		lastActivityAt: item.lastActivityAt,
		detailRef: item.detailRef,
	};
	switch (item.source) {
		case "github_issue":
			return {
				...baseFields,
				meta: { type: "github_issue", repo, number, labels: [] },
			};
		case "github_pr":
			return {
				...baseFields,
				meta: {
					type: "github_pr",
					repo,
					number,
					additions: 0,
					deletions: 0,
					changedFiles: 0,
				},
			};
		case "github_discussion":
			return {
				...baseFields,
				meta: {
					type: "github_discussion",
					repo,
					number,
					category: { name: "Discussion", emoji: "💬" },
				},
			};
		case "gitlab_issue":
			return {
				...baseFields,
				meta: { type: "gitlab_issue", repo, number, labels: [] },
			};
		case "gitlab_mr":
			return {
				...baseFields,
				meta: {
					type: "gitlab_mr",
					repo,
					number,
					draft: item.state?.tone === "draft",
				},
			};
	}
}

function parseExternalNumber(externalId: string): number {
	const idx = Math.max(
		externalId.lastIndexOf("#"),
		externalId.lastIndexOf("!"),
	);
	if (idx === -1) return 0;
	const tail = externalId.slice(idx + 1);
	const parsed = Number.parseInt(tail, 10);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function parseExternalRepo(externalId: string): string {
	const idx = Math.max(
		externalId.lastIndexOf("#"),
		externalId.lastIndexOf("!"),
	);
	return idx === -1 ? externalId : externalId.slice(0, idx);
}

function ConnectForgeState({
	provider,
	onConfigure,
}: {
	provider: ForgeFilterId;
	onConfigure: () => void;
}) {
	const labels = forgeLabelsFor(provider);
	return (
		<div className="mt-8 flex flex-col items-center gap-2 px-6 text-center">
			<div className="flex size-8 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
				{provider === "github" ? (
					<GithubBrandIcon size={16} />
				) : (
					<GitlabBrandIcon size={16} />
				)}
			</div>
			<div className="text-[13px] font-medium text-foreground">
				{labels.connectAction}
			</div>
			<Button
				type="button"
				size="sm"
				onClick={onConfigure}
				className="mt-1 cursor-pointer"
			>
				Configure
			</Button>
		</div>
	);
}

function KindDisabledState({
	labels,
	onConfigure,
}: {
	labels: InboxKindLabels | null;
	onConfigure: () => void;
}) {
	const plural = labels?.plural ?? "Issues";
	const lower = plural.toLowerCase();
	return (
		<div className="mt-8 flex flex-col items-center gap-2 px-6 text-center">
			<div className="text-[13px] font-medium text-foreground">
				{plural} are off
			</div>
			<div className="text-[12px] leading-5 text-muted-foreground">
				Turn {lower} back on in Contexts settings.
			</div>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={onConfigure}
				className="mt-1 cursor-pointer text-[12px]"
			>
				Configure
			</Button>
		</div>
	);
}

function NoItemsState({
	labels,
	repoFilter,
}: {
	labels: InboxKindLabels | null;
	repoFilter: string | null;
}) {
	const lower = (labels?.plural ?? "Issues").toLowerCase();
	const title = repoFilter ? `No ${lower} in ${repoFilter}` : `No ${lower} yet`;
	return (
		<div className="mt-8 flex flex-col items-center gap-1 px-6 text-center">
			<div className="text-[12px] leading-5 text-muted-foreground/80">
				{title}
			</div>
		</div>
	);
}

function ConnectLinearState({ onConfigure }: { onConfigure: () => void }) {
	return (
		<div className="mt-8 flex flex-col items-center gap-2 px-6 text-center">
			<div className="flex size-8 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
				<SourceIcon source="linear" size={16} />
			</div>
			<div className="text-[13px] font-medium text-foreground">
				Connect Linear
			</div>
			<div className="text-[12px] leading-5 text-muted-foreground">
				Pull in issues from your Linear workspace.
			</div>
			<Button
				type="button"
				size="sm"
				onClick={onConfigure}
				className="mt-1 cursor-pointer"
			>
				Open Settings
			</Button>
		</div>
	);
}

function LinkLinearTeamState({ repoId }: { repoId: string }) {
	return (
		<div className="mt-8 flex flex-col items-center gap-2 px-6 text-center">
			<div className="text-[13px] font-medium text-foreground">
				Link a Linear team
			</div>
			<div className="text-[12px] leading-5 text-muted-foreground">
				Pick which Linear team's issues should show up for this repository.
			</div>
			<div className="mt-1">
				<LinearTeamPicker repoId={repoId} />
			</div>
		</div>
	);
}

function NoRepositoryState() {
	return (
		<div className="mt-8 flex flex-col items-center gap-1 px-6 text-center">
			<div className="text-[12px] leading-5 text-muted-foreground/80">
				Select a repository to see Linear tasks.
			</div>
		</div>
	);
}

function NoLinearTasksState() {
	return (
		<div className="mt-8 flex flex-col items-center gap-1 px-6 text-center">
			<div className="text-[12px] leading-5 text-muted-foreground/80">
				No Linear tasks
			</div>
		</div>
	);
}
