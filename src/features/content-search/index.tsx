import { ArrowLeft, ChevronDown, ChevronRight, FileIcon } from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
 * Push-view that replaces the workspace list in the left sidebar when
 * Cmd+Shift+F is active. State (query, collapsed groups) lives in
 * `ContentSearchStateProvider` and is preserved across toggle for the
 * lifetime of the workspace.
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

	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="flex items-center gap-2 px-3 py-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onClose}
					className="h-7 cursor-pointer gap-1 px-2"
					aria-label="Close search"
				>
					<ArrowLeft className="size-[13px]" strokeWidth={1.8} />
					Back
				</Button>
				<span className="text-xs font-medium text-muted-foreground">
					Search in files
				</span>
			</header>
			<div className="px-3 pb-2">
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={handleInputKeyDown}
					placeholder="Search across workspace…"
					className={cn(
						"w-full rounded-md border border-input/40 bg-input/30 px-2 py-1.5 text-sm outline-none",
						"focus:border-input focus:bg-input/50",
					)}
					aria-label="Search query"
				/>
				<ResultsSummary
					tooShort={search.tooShort}
					status={search.status}
					query={query}
					hits={hits}
					totalFiles={totalFiles}
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
	truncated: boolean;
}

function ResultsSummary({
	tooShort,
	status,
	query,
	hits,
	totalFiles,
	truncated,
}: ResultsSummaryProps) {
	if (tooShort) {
		return (
			<p className="mt-2 text-xs text-muted-foreground">
				Type at least 3 characters to search.
			</p>
		);
	}
	if (status === "loading") {
		return <p className="mt-2 text-xs text-muted-foreground">Searching…</p>;
	}
	if (status === "ready" && query.trim().length > 0 && hits.length === 0) {
		return (
			<p className="mt-2 text-xs text-muted-foreground">No matches found.</p>
		);
	}
	if (status === "ready" && hits.length > 0) {
		const fileSuffix = totalFiles === 1 ? "file" : "files";
		const text = truncated
			? `Showing ${hits.length} of ${totalFiles} ${fileSuffix} — refine to narrow.`
			: `${totalFiles} ${fileSuffix}.`;
		return <p className="mt-2 text-xs text-muted-foreground">{text}</p>;
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
	return (
		<div className="mb-1">
			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-xs",
					"hover:bg-muted/60",
				)}
			>
				{collapsed ? (
					<ChevronRight className="size-3 shrink-0 opacity-70" />
				) : (
					<ChevronDown className="size-3 shrink-0 opacity-70" />
				)}
				<FileIcon className="size-3 shrink-0 opacity-60" />
				<span className="truncate font-medium">{hit.fileName}</span>
				<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
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
