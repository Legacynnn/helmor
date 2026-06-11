// Search results grouped by file, with highlighted line previews and an
// optional replacement preview per match row.
import { ChevronRightIcon } from "lucide-react";
import { useCallback, useState } from "react";
import type {
	WorkspaceSearchFileResult,
	WorkspaceSearchMatch,
	WorkspaceSearchResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { DIFF_ROW_RENDER_STYLE, getCachedFileIcon } from "../git/shared";

export function SearchResults({
	response,
	replacement,
	showReplacementPreview,
	onOpenMatch,
	onOpenFile,
}: {
	response: WorkspaceSearchResponse;
	replacement: string;
	showReplacementPreview: boolean;
	onOpenMatch: (file: WorkspaceSearchFileResult, lineNumber: number) => void;
	onOpenFile: (relativePath: string) => void;
}) {
	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
	const toggle = useCallback((path: string) => {
		setCollapsed((previous) => {
			const next = new Set(previous);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	}, []);

	return (
		<div className="py-0.5">
			{response.files.map((file) => {
				const isCollapsed = collapsed.has(file.path);
				return (
					<div key={file.path}>
						<div
							className="flex cursor-pointer items-center gap-1 py-[1.5px] pl-2 pr-2 text-muted-foreground transition-colors hover:bg-accent/60"
							style={DIFF_ROW_RENDER_STYLE}
							onClick={() => toggle(file.path)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									toggle(file.path);
								}
							}}
							tabIndex={0}
							role="treeitem"
							aria-expanded={!isCollapsed}
						>
							<ChevronRightIcon
								className={cn(
									"size-3 shrink-0 transition-transform",
									!isCollapsed && "rotate-90",
								)}
								strokeWidth={1.8}
							/>
							<img
								src={getCachedFileIcon(file.path.split("/").pop() ?? file.path)}
								alt=""
								className="size-4 shrink-0"
							/>
							<span className="truncate">{file.path}</span>
							<span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-micro text-muted-foreground">
								{file.matches.length}
							</span>
						</div>
						{!isCollapsed &&
							file.matches.map((match, index) => (
								<MatchRow
									key={`${file.path}:${match.lineNumber}:${index}`}
									match={match}
									replacement={replacement}
									showReplacementPreview={showReplacementPreview}
									onOpen={() => onOpenMatch(file, match.lineNumber)}
								/>
							))}
					</div>
				);
			})}

			{response.fileNameMatches.length > 0 && (
				<>
					<div className="px-2.5 pb-1 pt-2.5">
						<span className="text-micro font-medium tracking-wide text-muted-foreground">
							Matching file names
						</span>
					</div>
					{response.fileNameMatches.map((path) => (
						<div
							key={path}
							className="flex cursor-pointer items-center gap-1 py-[1.5px] pl-4 pr-2 text-muted-foreground transition-colors hover:bg-accent/60"
							style={DIFF_ROW_RENDER_STYLE}
							onClick={() => onOpenFile(path)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									onOpenFile(path);
								}
							}}
							tabIndex={0}
							role="treeitem"
						>
							<img
								src={getCachedFileIcon(path.split("/").pop() ?? path)}
								alt=""
								className="size-4 shrink-0"
							/>
							<span className="truncate">{path}</span>
						</div>
					))}
				</>
			)}

			{response.truncated && (
				<div className="px-3 py-2 text-micro text-muted-foreground">
					Results truncated — refine the search to see everything.
				</div>
			)}
		</div>
	);
}

function MatchRow({
	match,
	replacement,
	showReplacementPreview,
	onOpen,
}: {
	match: WorkspaceSearchMatch;
	replacement: string;
	showReplacementPreview: boolean;
	onOpen: () => void;
}) {
	return (
		<div
			className="flex cursor-pointer items-center gap-1.5 py-[1.5px] pl-7 pr-2 text-muted-foreground transition-colors hover:bg-accent/60"
			style={DIFF_ROW_RENDER_STYLE}
			onClick={onOpen}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onOpen();
				}
			}}
			tabIndex={0}
			role="treeitem"
		>
			<span className="w-7 shrink-0 text-right text-micro tabular-nums text-muted-foreground/60">
				{match.lineNumber}
			</span>
			<span className="truncate whitespace-pre">
				{match.prefix}
				{showReplacementPreview ? (
					<>
						<mark className="rounded-[2px] bg-red-500/20 px-px text-muted-foreground line-through">
							{match.matched}
						</mark>
						<mark className="rounded-[2px] bg-green-500/25 px-px text-foreground">
							{replacement}
						</mark>
					</>
				) : (
					<mark className="rounded-[2px] bg-yellow-500/30 px-px text-foreground">
						{match.matched}
					</mark>
				)}
				{match.suffix}
			</span>
		</div>
	);
}
