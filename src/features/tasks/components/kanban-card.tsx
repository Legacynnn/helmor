import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Task } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ProjectIcon } from "./project-icon";
import { TaskPriorityIcon } from "./task-priority-icon";

export function KanbanCard({
	task,
	selected,
	dragging,
}: {
	task: Task;
	selected?: boolean;
	dragging?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-2 rounded-lg border bg-card p-2.5 text-left shadow-xs",
				"transition-[border-color,box-shadow,transform] duration-150 ease-out",
				dragging
					? "cursor-grabbing border-primary/50 ring-2 ring-primary/30"
					: cn(
							"cursor-grab hover:-translate-y-px hover:border-border hover:shadow-md",
							"active:translate-y-0 active:shadow-xs",
							selected
								? "border-primary/60 ring-2 ring-primary/25"
								: "border-border/50",
						),
			)}
		>
			<div className="flex items-center gap-2">
				<TaskPriorityIcon
					priority={task.priority}
					size={14}
					className="text-muted-foreground"
				/>
				<span className="font-mono text-muted-foreground text-small tabular-nums">
					{task.identifier ?? "—"}
				</span>
				{task.dirty ? (
					<span
						className="size-1.5 animate-pulse rounded-full bg-primary/70"
						title="Syncing…"
					/>
				) : null}
				{task.assignee ? (
					<Avatar className="ml-auto size-5">
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
				) : null}
			</div>
			<p className="line-clamp-2 text-foreground text-ui leading-snug">
				{task.title}
			</p>
			{task.project ? (
				<span className="inline-flex max-w-full items-center gap-1 self-start text-[10px] text-muted-foreground">
					<ProjectIcon project={task.project} size={12} />
					<span className="truncate">{task.project.name}</span>
				</span>
			) : null}
			{task.labels.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{task.labels.slice(0, 4).map((label) => (
						<span
							key={label.id}
							className="inline-flex items-center gap-1 rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
						>
							<span
								className="size-1.5 rounded-full"
								style={{ backgroundColor: label.color ?? "#8b8b8b" }}
							/>
							{label.name}
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}
