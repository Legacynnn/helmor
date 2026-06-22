import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Task, TaskStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { KIND_ORDER, statusKey } from "../filters/status-order";
import { ProjectIcon } from "./project-icon";
import { TaskPriorityIcon } from "./task-priority-icon";
import { TaskStatusIcon } from "./task-status-icon";

type StatusGroup = {
	status: TaskStatus;
	tasks: Task[];
};

function formatRelativeTime(iso: string | null): string {
	if (!iso) return "—";
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "—";
	const diff = Date.now() - then;
	const mins = Math.round(diff / 60000);
	if (mins < 1) return "now";
	if (mins < 60) return `${mins}m`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d`;
	return new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

export function TasksTable({
	tasks,
	selectedTaskId,
	onSelectTask,
}: {
	tasks: Task[];
	selectedTaskId: string | null;
	onSelectTask: (taskId: string) => void;
}) {
	const groups = useMemo<StatusGroup[]>(() => {
		const byStatus = new Map<string, StatusGroup>();
		for (const task of tasks) {
			const key = statusKey(task.status);
			const existing = byStatus.get(key);
			if (existing) existing.tasks.push(task);
			else byStatus.set(key, { status: task.status, tasks: [task] });
		}
		return [...byStatus.values()].sort((a, b) => {
			const byKind = KIND_ORDER[a.status.kind] - KIND_ORDER[b.status.kind];
			return byKind !== 0 ? byKind : a.status.name.localeCompare(b.status.name);
		});
	}, [tasks]);

	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

	function toggle(key: string) {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	return (
		<div className="flex flex-col pb-8">
			{groups.map((group) => {
				const key = group.status.id || group.status.kind;
				const isCollapsed = collapsed.has(key);
				return (
					<section key={key}>
						<button
							type="button"
							onClick={() => toggle(key)}
							className="sticky top-0 z-10 flex h-9 w-full cursor-pointer items-center gap-2 border-border/40 border-b bg-background/95 px-3 text-ui backdrop-blur supports-[backdrop-filter]:bg-background/80 hover:bg-muted/60"
						>
							<ChevronRight
								className={cn(
									"size-3.5 text-muted-foreground transition-transform duration-200 ease-out",
									!isCollapsed && "rotate-90",
								)}
							/>
							<TaskStatusIcon
								kind={group.status.kind}
								color={group.status.color}
								title={group.status.name}
								size={15}
							/>
							<span className="font-medium text-foreground">
								{group.status.name}
							</span>
							<span className="text-muted-foreground tabular-nums">
								{group.tasks.length}
							</span>
						</button>

						{!isCollapsed &&
							group.tasks.map((task) => (
								<TaskRow
									key={task.id}
									task={task}
									selected={selectedTaskId === task.id}
									onSelect={() => onSelectTask(task.id)}
								/>
							))}
					</section>
				);
			})}
		</div>
	);
}

function TaskRow({
	task,
	selected,
	onSelect,
}: {
	task: Task;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex h-9 w-full cursor-pointer items-center gap-3 border-border/20 border-b px-3 text-left transition-colors",
				selected ? "bg-accent" : "hover:bg-accent/50",
			)}
		>
			<TaskPriorityIcon
				priority={task.priority}
				className="text-muted-foreground"
			/>
			<span className="w-16 shrink-0 font-mono text-muted-foreground text-small tabular-nums">
				{task.identifier ?? "—"}
			</span>
			<span className="min-w-0 flex-1 truncate text-foreground text-ui">
				{task.title}
			</span>
			{task.project ? (
				<span className="hidden max-w-[160px] shrink-0 items-center gap-1 text-[11px] text-muted-foreground lg:inline-flex">
					<ProjectIcon project={task.project} size={13} />
					<span className="truncate">{task.project.name}</span>
				</span>
			) : null}
			{task.labels.length > 0 ? (
				<span className="hidden shrink-0 items-center gap-1 md:flex">
					{task.labels.slice(0, 3).map((label) => (
						<span
							key={label.id}
							className="size-2 rounded-full"
							style={{ backgroundColor: label.color ?? "#8b8b8b" }}
							title={label.name}
						/>
					))}
				</span>
			) : null}
			<span className="w-10 shrink-0 text-right text-muted-foreground text-small tabular-nums">
				{formatRelativeTime(task.remoteUpdatedAt)}
			</span>
			{task.assignee ? (
				<Avatar className="size-5 shrink-0">
					{task.assignee.avatarUrl ? (
						<AvatarImage
							src={task.assignee.avatarUrl}
							alt={task.assignee.name}
						/>
					) : null}
					<AvatarFallback className="text-[9px]">
						{task.assignee.name.slice(0, 2).toUpperCase()}
					</AvatarFallback>
				</Avatar>
			) : (
				<span className="size-5 shrink-0" />
			)}
		</button>
	);
}
