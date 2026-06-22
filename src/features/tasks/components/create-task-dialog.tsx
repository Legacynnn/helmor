import { useMutation } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
	createTask,
	type IntegrationProvider,
	type TaskAssignee,
	type TaskLabel,
	type TaskPriority,
	type TaskProject,
	type TaskStatus,
	taskPriorityToNumber,
} from "@/lib/api";
import { AssigneeSelect } from "./inline-edit/assignee-select";
import { LabelSelect } from "./inline-edit/label-select";
import { MarkdownEditor } from "./inline-edit/markdown-editor";
import { PrioritySelect } from "./inline-edit/priority-select";
import { ProjectSelect } from "./inline-edit/project-select";
import { StatusSelect } from "./inline-edit/status-select";

const NUM_TO_PRIORITY: TaskPriority[] = [
	"none",
	"urgent",
	"high",
	"medium",
	"low",
];

/** Prefer a backlog/unstarted column as the default status, like Linear. */
function defaultStatus(options: TaskStatus[]): TaskStatus | null {
	return (
		options.find((s) => s.kind === "backlog") ??
		options.find((s) => s.kind === "unstarted") ??
		options[0] ??
		null
	);
}

export function CreateTaskDialog({
	open,
	onOpenChange,
	provider,
	teamId,
	teamName,
	statusOptions,
	assigneeOptions,
	projectOptions,
	labelOptions,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	provider: IntegrationProvider;
	teamId: string;
	teamName?: string | null;
	statusOptions: TaskStatus[];
	assigneeOptions: TaskAssignee[];
	projectOptions: TaskProject[];
	labelOptions: TaskLabel[];
}) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<TaskPriority>("none");
	const [status, setStatus] = useState<TaskStatus | null>(null);
	const [assigneeId, setAssigneeId] = useState<string | null>(null);
	const [projectId, setProjectId] = useState<string | null>(null);
	const [labelIds, setLabelIds] = useState<string[]>([]);
	const [createMore, setCreateMore] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Seed the status default once options arrive / the dialog (re)opens.
	useEffect(() => {
		if (open && !status) setStatus(defaultStatus(statusOptions));
	}, [open, status, statusOptions]);

	const assignee = useMemo(
		() => assigneeOptions.find((a) => a.id === assigneeId) ?? null,
		[assigneeOptions, assigneeId],
	);
	const project = useMemo(
		() => projectOptions.find((p) => p.id === projectId) ?? null,
		[projectOptions, projectId],
	);
	const selectedLabels = useMemo(
		() => labelOptions.filter((l) => labelIds.includes(l.id)),
		[labelOptions, labelIds],
	);

	function resetContent() {
		setTitle("");
		setDescription("");
		setError(null);
	}
	function resetAll() {
		resetContent();
		setPriority("none");
		setStatus(null);
		setAssigneeId(null);
		setProjectId(null);
		setLabelIds([]);
	}

	const createMutation = useMutation({
		mutationFn: () =>
			createTask({
				provider,
				teamId,
				title: title.trim(),
				description: description.trim() || null,
				priority: taskPriorityToNumber(priority),
				statusId: status?.id ?? null,
				assigneeId: assigneeId || null,
				projectId: projectId || null,
				labelIds: labelIds.length ? labelIds : null,
			}),
		onSuccess: () => {
			if (createMore) {
				resetContent();
			} else {
				resetAll();
				onOpenChange(false);
			}
		},
		onError: (err) =>
			setError(err instanceof Error ? err.message : String(err)),
	});

	const canSubmit = Boolean(title.trim()) && !createMutation.isPending;

	function submit() {
		if (canSubmit) createMutation.mutate();
	}

	function onKeyDown(event: React.KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			submit();
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) resetAll();
				onOpenChange(next);
			}}
		>
			<DialogContent
				showCloseButton
				onKeyDown={onKeyDown}
				className="top-[12%] w-[94vw] max-w-3xl translate-y-0 gap-0 overflow-hidden bg-popover p-0 sm:max-w-3xl"
			>
				<DialogTitle className="sr-only">New task</DialogTitle>

				<div className="flex items-center gap-2 px-4 pt-4 pb-1 text-small">
					<span className="rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-medium text-foreground">
						{teamName ?? "Team"}
					</span>
					<ChevronRight className="size-3.5 text-muted-foreground" />
					<span className="text-muted-foreground">New task</span>
				</div>

				<div className="flex flex-col gap-2 px-4 pt-2">
					<input
						autoFocus
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Task title"
						className="w-full bg-transparent px-2 font-medium text-foreground text-lg outline-none placeholder:text-muted-foreground/50"
					/>
					<MarkdownEditor
						value={description}
						onChange={setDescription}
						placeholder="Add description…"
						minHeightClass="min-h-28"
					/>
				</div>

				<div className="flex flex-wrap items-center gap-1.5 px-4 py-3">
					{status ? (
						<StatusSelect
							status={status}
							options={statusOptions.length ? statusOptions : [status]}
							onChange={(id) =>
								setStatus(statusOptions.find((s) => s.id === id) ?? status)
							}
						/>
					) : null}
					{provider !== "github" ? (
						<PrioritySelect
							priority={priority}
							onChange={(num) => setPriority(NUM_TO_PRIORITY[num] ?? "none")}
						/>
					) : null}
					<AssigneeSelect
						assignee={assignee}
						options={assigneeOptions}
						onChange={(id) => setAssigneeId(id || null)}
					/>
					{provider !== "github" ? (
						<ProjectSelect
							project={project}
							options={projectOptions}
							onChange={(id) => setProjectId(id || null)}
						/>
					) : null}
					<LabelSelect
						value={selectedLabels}
						options={labelOptions}
						onChange={setLabelIds}
					/>
				</div>

				{error ? (
					<p className="px-4 pb-2 text-destructive text-small">{error}</p>
				) : null}

				<div className="flex items-center gap-3 border-border/40 border-t px-4 py-3">
					<label
						htmlFor="create-more-toggle"
						className="flex cursor-pointer items-center gap-2 text-muted-foreground text-small"
					>
						<Switch
							id="create-more-toggle"
							checked={createMore}
							onCheckedChange={setCreateMore}
						/>
						Create more
					</label>
					<Button
						type="button"
						size="sm"
						className="ml-auto"
						disabled={!canSubmit}
						onClick={submit}
					>
						{createMutation.isPending ? "Creating…" : "Create task"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
