import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileIcon } from "@/features/file-browser/file-icon";
import type { ContentSearchHit } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useEditorActions } from "@/shell/editor-actions-context";

import { useContentSearch } from "./hooks/use-content-search";
import { useContentSearchController } from "./hooks/use-content-search-state";
import { highlightLine } from "./lib/highlight";

interface Props {
	workspaceRootPath: string | null;
	onClose: () => void;
}

/**
 * Right-sidebar panel rendered when `rightSidebarMode === "search"`
 * (toggled via Cmd+Shift+F). State (query, collapsed groups) lives in
 * `ContentSearchStateProvider` and is preserved across mode switches for
 * the lifetime of the workspace.
 */
export function ContentSearchPanel({ workspaceRootPath, onClose }: Props) {
	const controller = useContentSearchController();
	const editorActions = useEditorActions();
	const inputRef = useRef<HTMLInputElement | null>(null);

	const { query, setQuery, collapsed, toggleCollapsed } = controller;

	const search = useContentSearch(workspaceRootPath, query, true);

	// Auto-focus on mount.
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleInputKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			}
		},
		[onClose],
	);

	const handleOpen = useCallback(
		(hit: ContentSearchHit, line: number) => {
			editorActions.openFile({
				absolutePath: hit.absolutePath,
				relativePath: hit.relativePath,
				fileName: hit.fileName,
				line,
			});
		},
		[editorActions],
	);

	const hits = search.result?.hits ?? [];
	const totalFiles = search.result?.totalFilesMatched ?? 0;
	const truncated = search.result?.truncated ?? false;
	const totalMatches = useMemo(
		() => hits.reduce((sum, h) => sum + h.totalMatchesInFile, 0),
		[hits],
	);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="flex shrink-0 items-center justify-between px-3 pb-2 pt-3">
				<h2 className="text-[13px] font-semibold tracking-tight text-app-foreground">
					Search
				</h2>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={onClose}
					className="size-6 cursor-pointer text-muted-foreground hover:text-app-foreground"
					aria-label="Close search"
				>
					<X className="size-3.5" strokeWidth={2} />
				</Button>
			</header>
			<div className="px-3 pb-2">
				<div className="relative">
					<Search
						className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
						strokeWidth={2}
						aria-hidden
					/>
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleInputKeyDown}
						placeholder="Search across workspace…"
						className={cn(
							"w-full rounded-md border border-input/40 bg-input/30 py-1.5 pl-7 pr-7 text-sm outline-none",
							"placeholder:text-muted-foreground/60",
							"focus:border-input focus:bg-input/50",
						)}
						aria-label="Search query"
					/>
					{query.length > 0 && (
						<button
							type="button"
							onClick={() => setQuery("")}
							className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted/60 hover:text-app-foreground"
							aria-label="Clear search"
						>
							<X className="size-3" strokeWidth={2} />
						</button>
					)}
				</div>
				<ResultsSummary
					tooShort={search.tooShort}
					status={search.status}
					query={query}
					hits={hits}
					totalFiles={totalFiles}
					totalMatches={totalMatches}
					truncated={truncated}
				/>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="px-2 pb-4">
					{search.error && (
						<div className="px-2 py-1 text-xs text-destructive">
							{search.error}
						</div>
					)}
					{hits.map((hit) => (
						<FileGroup
							key={hit.relativePath}
							hit={hit}
							collapsed={collapsed.has(hit.relativePath)}
							onToggle={() => toggleCollapsed(hit.relativePath)}
							onOpenMatch={(line) => handleOpen(hit, line)}
						/>
					))}
				</div>
			</ScrollArea>
		</div>
	);
}

interface ResultsSummaryProps {
	tooShort: boolean;
	status: "idle" | "loading" | "ready" | "error";
	query: string;
	hits: ContentSearchHit[];
	totalFiles: number;
	totalMatches: number;
	truncated: boolean;
}

function ResultsSummary({
	tooShort,
	status,
	query,
	hits,
	totalFiles,
	totalMatches,
	truncated,
}: ResultsSummaryProps) {
	if (tooShort) {
		return (
			<p className="mt-2 text-[11px] text-muted-foreground/80">
				Type at least 3 characters to search.
			</p>
		);
	}
	if (status === "loading") {
		return (
			<p className="mt-2 text-[11px] text-muted-foreground/80">Searching…</p>
		);
	}
	if (status === "ready" && query.trim().length > 0 && hits.length === 0) {
		return (
			<p className="mt-2 text-[11px] text-muted-foreground/80">
				No matches found.
			</p>
		);
	}
	if (status === "ready" && hits.length > 0) {
		const matchLabel = totalMatches === 1 ? "match" : "matches";
		const fileLabel = totalFiles === 1 ? "file" : "files";
		return (
			<p className="mt-2 flex items-center gap-1.5 text-[11px]">
				<span className="font-medium text-app-foreground">
					{totalMatches.toLocaleString()} {matchLabel}
				</span>
				<span className="text-muted-foreground/60">in</span>
				<span className="font-medium text-app-foreground">
					{totalFiles.toLocaleString()} {fileLabel}
				</span>
				{truncated && (
					<span className="ml-auto text-muted-foreground/70">
						truncated — refine to narrow
					</span>
				)}
			</p>
		);
	}
	return null;
}

interface FileGroupProps {
	hit: ContentSearchHit;
	collapsed: boolean;
	onToggle: () => void;
	onOpenMatch: (line: number) => void;
}

function FileGroup({ hit, collapsed, onToggle, onOpenMatch }: FileGroupProps) {
	const extra = hit.totalMatchesInFile - hit.matches.length;
	const lastSlash = hit.relativePath.lastIndexOf("/");
	const directory = lastSlash >= 0 ? hit.relativePath.slice(0, lastSlash) : "";
	return (
		<div className="mb-1">
			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-1 text-left",
					"hover:bg-muted/60",
				)}
				title={hit.relativePath}
			>
				{collapsed ? (
					<ChevronRight className="size-3 shrink-0 opacity-70" />
				) : (
					<ChevronDown className="size-3 shrink-0 opacity-70" />
				)}
				<FileIcon name={hit.fileName} kind="file" className="size-3.5" />
				<span className="truncate text-xs font-medium text-app-foreground">
					{hit.fileName}
				</span>
				{directory && (
					<span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/60">
						{directory}
					</span>
				)}
				<span
					className={cn(
						"ml-auto shrink-0 rounded-full bg-muted/60 px-1.5 py-[1px] text-[10px] font-medium text-muted-foreground tabular-nums",
						"group-hover:bg-muted",
					)}
				>
					{hit.totalMatchesInFile}
				</span>
			</button>
			{!collapsed && (
				<div className="ml-1 mt-0.5 space-y-0.5 border-l border-border/50 pl-2">
					{hit.matches.map((m) => (
						<MatchRow
							key={`${hit.relativePath}:${m.lineNumber}`}
							lineNumber={m.lineNumber}
							line={m.line}
							ranges={m.matchRanges}
							contextBefore={m.contextBefore}
							contextAfter={m.contextAfter}
							onOpen={() => onOpenMatch(m.lineNumber)}
						/>
					))}
					{extra > 0 && (
						<button
							type="button"
							onClick={() =>
								onOpenMatch(
									hit.matches[hit.matches.length - 1]?.lineNumber ?? 1,
								)
							}
							className="block w-full cursor-pointer rounded-sm px-1.5 py-0.5 text-left text-[11px] text-muted-foreground hover:bg-muted/40"
						>
							+{extra} more match{extra === 1 ? "" : "es"}
						</button>
					)}
				</div>
			)}
		</div>
	);
}

interface MatchRowProps {
	lineNumber: number;
	line: string;
	ranges: Array<[number, number]>;
	contextBefore?: string;
	contextAfter?: string;
	onOpen: () => void;
}

function MatchRow({
	lineNumber,
	line,
	ranges,
	contextBefore,
	contextAfter,
	onOpen,
}: MatchRowProps) {
	const segments = useMemo(() => highlightLine(line, ranges), [line, ranges]);
	return (
		<button
			type="button"
			onClick={onOpen}
			className={cn(
				"block w-full cursor-pointer rounded-sm px-1.5 py-0.5 text-left font-mono text-[11px] leading-tight",
				"hover:bg-muted/60",
			)}
		>
			{contextBefore !== undefined && contextBefore.length > 0 && (
				<div className="truncate text-muted-foreground/70">{contextBefore}</div>
			)}
			<div className="flex gap-1.5">
				<span className="shrink-0 text-muted-foreground/60 tabular-nums">
					{lineNumber}
				</span>
				<span className="truncate">
					{segments.map((seg, i) =>
						seg.kind === "match" ? (
							<mark
								key={`${i}-m`}
								className="rounded-sm bg-yellow-300/30 px-0.5 text-foreground"
							>
								{seg.value}
							</mark>
						) : (
							<span key={`${i}-t`}>{seg.value}</span>
						),
					)}
				</span>
			</div>
			{contextAfter !== undefined && contextAfter.length > 0 && (
				<div className="truncate text-muted-foreground/70">{contextAfter}</div>
			)}
		</button>
	);
}

export {
	ContentSearchStateProvider,
	useContentSearchController,
} from "./hooks/use-content-search-state";
