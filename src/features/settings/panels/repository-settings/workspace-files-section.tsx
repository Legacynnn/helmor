// Workspace files section — per-repo list of essential, git-ignored files
// (.env, keys, local config) to copy into every new workspace.
//
// Two sources feed the copy set: auto-detected secret-like untracked
// files (toggleable, individually excludable) and an explicit user list
// of free-form relative paths (files or folders). State lives locally and
// every mutation persists immediately via `updateRepoCopySettings` — these
// are discrete actions (toggle / add / remove), not free typing, so there's
// no debounce except inside the add-path input.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, FolderInput, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
	detectRepoCopyCandidates,
	loadRepoCopySettings,
	type RepoCopySettings,
	updateRepoCopySettings,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const EMPTY_SETTINGS: RepoCopySettings = {
	autoCopyUntracked: true,
	copyFiles: [],
	copyExclude: [],
};

export function WorkspaceFilesSection({ repoId }: { repoId: string }) {
	const queryClient = useQueryClient();

	const settingsQuery = useQuery({
		queryKey: ["repoCopySettings", repoId],
		queryFn: () => loadRepoCopySettings(repoId),
		staleTime: 0,
	});
	const candidatesQuery = useQuery({
		queryKey: ["repoCopyCandidates", repoId],
		queryFn: () => detectRepoCopyCandidates(repoId),
		staleTime: 30_000,
	});

	const settings = settingsQuery.data ?? EMPTY_SETTINGS;
	const candidates = useMemo(
		() => candidatesQuery.data ?? [],
		[candidatesQuery.data],
	);

	const persist = useCallback(
		(next: RepoCopySettings) => {
			// Optimistically update the cache so the UI reflects the change
			// instantly; the write + refetch reconcile shortly after.
			queryClient.setQueryData(["repoCopySettings", repoId], next);
			void updateRepoCopySettings(repoId, next).then(() => {
				void queryClient.invalidateQueries({
					queryKey: ["repoCopySettings", repoId],
				});
			});
		},
		[repoId, queryClient],
	);

	const handleToggleAuto = useCallback(
		(checked: boolean) => persist({ ...settings, autoCopyUntracked: checked }),
		[settings, persist],
	);

	// Detected files the user has NOT explicitly added to copyFiles — those
	// render under the user list instead, to avoid a path appearing twice.
	const excludeSet = useMemo(
		() => new Set(settings.copyExclude),
		[settings.copyExclude],
	);
	const userSet = useMemo(
		() => new Set(settings.copyFiles),
		[settings.copyFiles],
	);
	const detectedRows = useMemo(
		() => candidates.filter((path) => !userSet.has(path)),
		[candidates, userSet],
	);

	const setDetectedIncluded = useCallback(
		(path: string, included: boolean) => {
			const nextExclude = included
				? settings.copyExclude.filter((p) => p !== path)
				: [...settings.copyExclude, path];
			persist({ ...settings, copyExclude: nextExclude });
		},
		[settings, persist],
	);

	const addUserPath = useCallback(
		(raw: string) => {
			const path = raw.trim();
			if (!path || settings.copyFiles.includes(path)) return;
			persist({ ...settings, copyFiles: [...settings.copyFiles, path] });
		},
		[settings, persist],
	);

	const removeUserPath = useCallback(
		(path: string) => {
			persist({
				...settings,
				copyFiles: settings.copyFiles.filter((p) => p !== path),
			});
		},
		[settings, persist],
	);

	const rescan = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: ["repoCopyCandidates", repoId],
		});
	}, [repoId, queryClient]);

	const loading = settingsQuery.isLoading;

	return (
		<div className="py-5">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="text-ui font-medium leading-snug text-foreground">
						Workspace files
					</div>
					<div className="mt-1 text-small leading-snug text-muted-foreground">
						Copy git-ignored essentials (.env, keys, local config) into every
						new workspace for this repo.
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					<span className="text-mini font-medium text-muted-foreground">
						Auto-detect
					</span>
					<Switch
						checked={settings.autoCopyUntracked}
						onCheckedChange={handleToggleAuto}
						disabled={loading}
						aria-label="Auto-copy untracked secret-like files into new workspaces"
					/>
				</div>
			</div>

			<div className="mt-4 space-y-4">
				{/* Auto-detected candidates */}
				{settings.autoCopyUntracked ? (
					<div>
						<div className="flex items-center justify-between gap-2">
							<div className="text-small font-medium text-app-foreground">
								Detected untracked files
							</div>
							<Button
								variant="ghost"
								size="xs"
								className="gap-1 text-muted-foreground hover:text-foreground"
								onClick={rescan}
								disabled={candidatesQuery.isFetching}
							>
								<RefreshCw
									className={cn(
										"size-3",
										candidatesQuery.isFetching && "animate-spin",
									)}
									strokeWidth={1.8}
								/>
								Rescan
							</Button>
						</div>
						{detectedRows.length === 0 ? (
							<div className="mt-2 text-mini text-muted-foreground/70">
								{candidatesQuery.isLoading
									? "Scanning…"
									: "No secret-like untracked files found."}
							</div>
						) : (
							<div className="mt-2 space-y-1">
								{detectedRows.map((path) => {
									const included = !excludeSet.has(path);
									return (
										<div
											key={path}
											className="flex items-center gap-2 rounded-lg border border-app-border/40 bg-app-base/20 px-3 py-1.5"
										>
											<FileText
												className="size-3.5 shrink-0 text-app-muted"
												strokeWidth={1.8}
											/>
											<span
												className={cn(
													"min-w-0 flex-1 truncate font-mono text-small",
													included
														? "text-foreground"
														: "text-muted-foreground/60 line-through",
												)}
											>
												{path}
											</span>
											<span className="shrink-0 rounded bg-app-base/60 px-1.5 py-0.5 text-mini text-muted-foreground">
												auto
											</span>
											<Switch
												checked={included}
												onCheckedChange={(checked) =>
													setDetectedIncluded(path, checked)
												}
												aria-label={`Copy ${path} into new workspaces`}
											/>
										</div>
									);
								})}
							</div>
						)}
					</div>
				) : null}

				{/* Explicit user-added paths */}
				<div>
					<div className="text-small font-medium text-app-foreground">
						Additional paths
					</div>
					<div className="mt-0.5 text-mini text-muted-foreground">
						Add any file or folder, relative to the repo root. Folders copy
						recursively.
					</div>

					{settings.copyFiles.length > 0 ? (
						<div className="mt-2 space-y-1">
							{settings.copyFiles.map((path) => (
								<div
									key={path}
									className="flex items-center gap-2 rounded-lg border border-app-border/40 bg-app-base/20 px-3 py-1.5"
								>
									<FolderInput
										className="size-3.5 shrink-0 text-app-muted"
										strokeWidth={1.8}
									/>
									<span className="min-w-0 flex-1 truncate font-mono text-small text-foreground">
										{path}
									</span>
									<Button
										variant="ghost"
										size="icon"
										className="size-7 text-muted-foreground hover:text-destructive"
										onClick={() => removeUserPath(path)}
										aria-label={`Remove ${path}`}
									>
										<Trash2 className="size-3.5" strokeWidth={1.8} />
									</Button>
								</div>
							))}
						</div>
					) : null}

					<AddPathInput onAdd={addUserPath} />
				</div>
			</div>
		</div>
	);
}

function AddPathInput({ onAdd }: { onAdd: (path: string) => void }) {
	const [value, setValue] = useState("");

	const commit = useCallback(() => {
		const trimmed = value.trim();
		if (!trimmed) return;
		onAdd(trimmed);
		setValue("");
	}, [value, onAdd]);

	return (
		<div className="mt-3 flex items-center gap-2">
			<Input
				className="h-7 flex-1 bg-app-base/30 font-mono text-small"
				placeholder="e.g. .env.local or config/secrets/"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						commit();
					}
				}}
				aria-label="Path to copy into new workspaces"
			/>
			<Button
				variant="default"
				size="xs"
				className="gap-1 hover:bg-primary/80"
				onClick={commit}
				disabled={!value.trim()}
			>
				<Plus strokeWidth={2} />
				Add
			</Button>
		</div>
	);
}
