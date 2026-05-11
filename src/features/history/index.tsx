import { ChevronDown, Search } from "lucide-react";
import { memo, useId, useMemo, useState } from "react";
import { HelmorLogoAnimated } from "@/components/helmor-logo-animated";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import type { WorkspaceRow } from "@/lib/api";
import { cn } from "@/lib/utils";
import { HistoryRow } from "./components/history-row";
import {
	filterRows,
	groupByDay,
	type HistoryGroup,
} from "./utils/group-by-day";

export type HistoryScreenProps = {
	rows: WorkspaceRow[];
	searchQuery: string;
	onSearchQueryChange: (next: string) => void;
	loading: boolean;
	onSelectWorkspace: (workspaceId: string) => void;
	onArchiveWorkspace: (workspaceId: string) => void;
	onRestoreWorkspace: (workspaceId: string) => void;
	archivingWorkspaceIds: Set<string>;
	restoringWorkspaceId: string | null;
};

export const HistoryScreen = memo(function HistoryScreen({
	rows,
	searchQuery,
	onSearchQueryChange,
	loading,
	onSelectWorkspace,
	onArchiveWorkspace,
	onRestoreWorkspace,
	archivingWorkspaceIds,
	restoringWorkspaceId,
}: HistoryScreenProps) {
	const searchInputId = useId();
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		() => new Set(),
	);

	const groups = useMemo<HistoryGroup[]>(() => {
		const filtered = filterRows(rows, searchQuery);
		return groupByDay(filtered);
	}, [rows, searchQuery]);

	const totalRows = useMemo(
		() => groups.reduce((acc, group) => acc + group.rows.length, 0),
		[groups],
	);

	const toggleGroup = (id: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<header
				aria-label="History"
				className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/40 bg-background/90 px-6 py-3 backdrop-blur"
				data-tauri-drag-region
			>
				<label
					htmlFor={searchInputId}
					className="relative flex w-full items-center"
				>
					<Search
						aria-hidden="true"
						className="absolute left-2.5 size-3.5 text-muted-foreground/70"
						strokeWidth={2}
					/>
					<Input
						id={searchInputId}
						type="search"
						value={searchQuery}
						onChange={(event) => onSearchQueryChange(event.target.value)}
						placeholder="Filter workspaces…"
						className="h-8 border-transparent bg-muted/40 pl-8 text-[13px] focus-visible:border-border focus-visible:bg-background"
						autoComplete="off"
						spellCheck={false}
					/>
				</label>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{loading && totalRows === 0 ? (
					<div className="flex items-center justify-center px-6 py-12">
						<HelmorLogoAnimated size={48} className="opacity-80" />
					</div>
				) : totalRows === 0 ? (
					<div className="px-6 py-12 text-center text-[13px] text-muted-foreground">
						{searchQuery
							? "No workspaces match your search."
							: "No workspace activity yet."}
					</div>
				) : (
					<div className="flex flex-col gap-2 px-2 py-4">
						{groups.map((group) => {
							const isOpen = !collapsedGroups.has(group.id);
							return (
								<Collapsible
									key={group.id}
									open={isOpen}
									onOpenChange={() => toggleGroup(group.id)}
								>
									<CollapsibleTrigger
										className={cn(
											"group/day flex w-full cursor-pointer items-center gap-2 rounded-md px-4 py-1.5 text-left",
											"text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70",
											"transition-colors hover:text-foreground",
										)}
									>
										<ChevronDown
											className={cn(
												"size-3 shrink-0 transition-transform duration-150",
												isOpen ? "rotate-0" : "-rotate-90",
											)}
											strokeWidth={2}
										/>
										<span>{group.label}</span>
										<span className="text-muted-foreground/50">
											{group.rows.length}
										</span>
									</CollapsibleTrigger>
									<CollapsibleContent className="overflow-hidden">
										<div className="flex flex-col">
											{group.rows.map((row) => (
												<HistoryRow
													key={row.id}
													row={row}
													onSelect={onSelectWorkspace}
													onArchive={onArchiveWorkspace}
													onRestore={onRestoreWorkspace}
													isArchiving={archivingWorkspaceIds.has(row.id)}
													isRestoring={restoringWorkspaceId === row.id}
												/>
											))}
										</div>
									</CollapsibleContent>
								</Collapsible>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
});
