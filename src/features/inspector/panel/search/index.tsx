// The inspector's Search tab: VS Code-like content search over the workspace
// (case / whole-word / regex, include/exclude globs, file-name matches) with
// bulk replace-in-files.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { replaceInWorkspace, type WorkspaceSearchFileResult } from "@/lib/api";
import { describeUnknownError } from "@/lib/workspace-helpers";
import { SearchResults } from "./results";
import { SearchControls } from "./search-controls";
import {
	EMPTY_SEARCH_PARAMS,
	type SearchParams,
	useWorkspaceSearch,
} from "./use-workspace-search";

type SearchTabProps = {
	workspaceRootPath: string | null;
	workspaceId: string | null;
	onOpenFileReference?: (
		path: string,
		line?: number,
		column?: number,
		options?: { preview?: boolean },
	) => void;
};

function SearchTabImpl({
	workspaceRootPath,
	workspaceId,
	onOpenFileReference,
}: SearchTabProps) {
	const queryClient = useQueryClient();
	const [params, setParams] = useState<SearchParams>(EMPTY_SEARCH_PARAMS);
	const [replacement, setReplacement] = useState("");
	const [replaceOpen, setReplaceOpen] = useState(false);
	const [globsOpen, setGlobsOpen] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);

	const searchQuery = useWorkspaceSearch(workspaceRootPath, params);
	const response = searchQuery.data;

	const replaceMutation = useMutation({
		mutationFn: replaceInWorkspace,
		onSuccess: (result) => {
			toast.success(
				`Replaced ${result.replacements} ${
					result.replacements === 1 ? "occurrence" : "occurrences"
				} in ${result.filesChanged} ${
					result.filesChanged === 1 ? "file" : "files"
				}`,
			);
			// The backend publishes filesChanged/gitStateChanged too; these
			// invalidations just make the refresh immediate.
			void queryClient.invalidateQueries({
				predicate: (query) => query.queryKey[0] === "workspaceSearch",
			});
			void queryClient.invalidateQueries({
				predicate: (query) => query.queryKey[0] === "workspaceChanges",
			});
		},
		onError: (error) => {
			toast.error(describeUnknownError(error, "Replace failed."));
		},
	});

	const handleOpenMatch = useCallback(
		(file: WorkspaceSearchFileResult, lineNumber: number) => {
			onOpenFileReference?.(file.absolutePath, lineNumber, undefined, {
				preview: true,
			});
		},
		[onOpenFileReference],
	);

	const handleOpenFile = useCallback(
		(relativePath: string) => {
			if (!workspaceRootPath) return;
			onOpenFileReference?.(
				`${workspaceRootPath}/${relativePath}`,
				undefined,
				undefined,
				{ preview: true },
			);
		},
		[workspaceRootPath, onOpenFileReference],
	);

	const handleReplaceAll = useCallback(() => {
		if (!workspaceRootPath || !response || response.files.length === 0) return;
		replaceMutation.mutate({
			workspaceRootPath,
			workspaceId,
			query: params.query,
			caseSensitive: params.caseSensitive,
			wholeWord: params.wholeWord,
			regex: params.regex,
			replacement,
			// Explicit file list from the on-screen results; the backend
			// re-runs the match per file before writing.
			paths: response.files.map((file) => file.path),
		});
		setConfirmOpen(false);
	}, [
		workspaceRootPath,
		workspaceId,
		response,
		params,
		replacement,
		replaceMutation,
	]);

	if (!workspaceRootPath) {
		return (
			<div className="px-3 py-3 text-mini leading-5 text-muted-foreground">
				No workspace selected.
			</div>
		);
	}

	const canReplaceAll =
		!!response &&
		response.files.length > 0 &&
		params.query.length > 0 &&
		!replaceMutation.isPending;
	const showReplacementPreview = replaceOpen && replacement.length > 0;

	return (
		<div className="flex min-h-0 flex-1 flex-col bg-sidebar">
			<SearchControls
				params={params}
				onParamsChange={setParams}
				replaceOpen={replaceOpen}
				onToggleReplace={() => setReplaceOpen((open) => !open)}
				replacement={replacement}
				onReplacementChange={setReplacement}
				globsOpen={globsOpen}
				onToggleGlobs={() => setGlobsOpen((open) => !open)}
				onReplaceAll={() => setConfirmOpen(true)}
				canReplaceAll={canReplaceAll}
			/>
			<ScrollArea
				aria-label="Search results"
				className="min-h-0 flex-1 bg-muted/20 font-mono text-mini"
			>
				{params.query.length === 0 ? (
					<div className="px-3 py-3 text-mini leading-5 text-muted-foreground">
						Search across all files in this workspace.
					</div>
				) : searchQuery.isError ? (
					<div className="px-3 py-3 text-mini leading-5 text-muted-foreground">
						{describeUnknownError(searchQuery.error, "Search failed.")}
					</div>
				) : response ? (
					response.files.length === 0 &&
					response.fileNameMatches.length === 0 ? (
						<div className="px-3 py-3 text-mini leading-5 text-muted-foreground">
							No results found.
						</div>
					) : (
						<>
							<div className="px-3 pt-2 text-micro text-muted-foreground">
								{response.totalMatches}{" "}
								{response.totalMatches === 1 ? "result" : "results"} in{" "}
								{response.files.length}{" "}
								{response.files.length === 1 ? "file" : "files"}
							</div>
							<SearchResults
								response={response}
								replacement={replacement}
								showReplacementPreview={showReplacementPreview}
								onOpenMatch={handleOpenMatch}
								onOpenFile={handleOpenFile}
							/>
						</>
					)
				) : (
					<div className="px-3 py-3 text-mini leading-5 text-muted-foreground">
						Searching…
					</div>
				)}
			</ScrollArea>
			<ConfirmDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				title="Replace all matches?"
				description={
					<span className="block">
						Replace {response?.totalMatches ?? 0}{" "}
						{(response?.totalMatches ?? 0) === 1 ? "occurrence" : "occurrences"}{" "}
						across {response?.files.length ?? 0}{" "}
						{(response?.files.length ?? 0) === 1 ? "file" : "files"} with "
						{replacement}"? Files are rewritten on disk.
					</span>
				}
				confirmLabel="Replace all"
				onConfirm={handleReplaceAll}
			/>
		</div>
	);
}

export const SearchTab = memo(SearchTabImpl);
