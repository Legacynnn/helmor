import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	SettingsSelect,
	type SettingsSelectOption,
} from "@/features/settings/components/settings-select";
import type { Task, WorkspaceMode } from "@/lib/api";
import { repositoriesQueryOptions } from "@/lib/query-client";
import { useCreateWorkspaceFromTask } from "../hooks/use-task-actions";

export function StartWorkspaceDialog({
	open,
	onOpenChange,
	task,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	task: Task;
}) {
	const reposQuery = useQuery(repositoriesQueryOptions());
	const repos = reposQuery.data ?? [];
	const [repoId, setRepoId] = useState<string>("");
	const [mode, setMode] = useState<WorkspaceMode>("worktree");
	const createMutation = useCreateWorkspaceFromTask();

	// Default to the first repo once loaded.
	useEffect(() => {
		if (!repoId && repos.length > 0) setRepoId(repos[0].id);
	}, [repoId, repos]);

	const repoOptions: SettingsSelectOption<string>[] = repos.map((repo) => ({
		value: repo.id,
		label: repo.name,
	}));
	const modeOptions: SettingsSelectOption<WorkspaceMode>[] = [
		{ value: "worktree", label: "Worktree (new branch)" },
		{ value: "local", label: "Local (current checkout)" },
	];

	function submit() {
		if (!repoId) return;
		createMutation.mutate(
			{ taskId: task.id, repoId, mode },
			{ onSuccess: () => onOpenChange(false) },
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Start workspace from task</DialogTitle>
					<DialogDescription>
						{task.identifier ? `${task.identifier} · ` : ""}
						{task.title}
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex items-center justify-between gap-3 text-ui">
						<span className="text-muted-foreground">Repository</span>
						<SettingsSelect
							value={repoId}
							options={
								repoOptions.length
									? repoOptions
									: [{ value: "", label: "No repositories" }]
							}
							onChange={setRepoId}
							ariaLabel="Repository"
						/>
					</div>
					<div className="flex items-center justify-between gap-3 text-ui">
						<span className="text-muted-foreground">Mode</span>
						<SettingsSelect
							value={mode}
							options={modeOptions}
							onChange={setMode}
							ariaLabel="Workspace mode"
						/>
					</div>
					{createMutation.isError ? (
						<p className="text-destructive text-small">
							{createMutation.error instanceof Error
								? createMutation.error.message
								: "Unable to start workspace"}
						</p>
					) : null}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={!repoId || createMutation.isPending}
						onClick={submit}
					>
						{createMutation.isPending ? "Starting…" : "Start workspace"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
