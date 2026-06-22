import {
	Bot,
	GitBranch,
	Maximize2,
	Minimize2,
	SquareArrowOutUpRight,
	X,
} from "lucide-react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
	Task,
	TaskAssignee,
	TaskLabel,
	TaskPatchInput,
	TaskStatus,
} from "@/lib/api";
import { openUrl } from "@/lib/platform-bridge";
import { drawerItemTransition } from "../motion";
import { AssigneeSelect } from "./inline-edit/assignee-select";
import { DescriptionEditor } from "./inline-edit/description-editor";
import { EditableTitle } from "./inline-edit/editable-title";
import { LabelSelect } from "./inline-edit/label-select";
import { PrioritySelect } from "./inline-edit/priority-select";
import { StatusSelect } from "./inline-edit/status-select";
import { ProjectIcon } from "./project-icon";

const listVariants: Variants = {
	hidden: {},
	show: { transition: { staggerChildren: 0.045, delayChildren: 0.06 } },
};
const itemVariants: Variants = {
	hidden: { opacity: 0, y: 8 },
	show: { opacity: 1, y: 0, transition: drawerItemTransition },
};

export function TaskDetailView({
	task,
	statusOptions,
	labelOptions,
	assigneeOptions,
	expanded,
	onToggleExpand,
	onClose,
	onUpdate,
	isUpdating,
	onReview,
	reviewPending,
	onStartWorkspace,
}: {
	task: Task;
	statusOptions: TaskStatus[];
	labelOptions: TaskLabel[];
	assigneeOptions: TaskAssignee[];
	expanded: boolean;
	onToggleExpand: () => void;
	onClose: () => void;
	onUpdate: (patch: TaskPatchInput) => void;
	isUpdating: boolean;
	onReview?: () => void;
	reviewPending?: boolean;
	onStartWorkspace?: () => void;
}) {
	const reduce = useReducedMotion();
	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center gap-2 border-border/40 border-b px-4 py-3">
				<span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-small tabular-nums">
					{task.identifier ?? task.externalId}
				</span>
				{task.dirty ? (
					<Badge variant="outline" className="text-[10px]">
						Syncing…
					</Badge>
				) : null}
				<div className="ml-auto flex items-center gap-1">
					{task.url ? (
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={
								task.provider === "github" ? "Open in GitHub" : "Open in Linear"
							}
							onClick={() => task.url && void openUrl(task.url)}
						>
							<SquareArrowOutUpRight className="size-3.5" />
						</Button>
					) : null}
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={expanded ? "Back to panel" : "Open as full page"}
						title={expanded ? "Collapse to panel" : "Open as full page"}
						onClick={onToggleExpand}
					>
						{expanded ? (
							<Minimize2 className="size-3.5" />
						) : (
							<Maximize2 className="size-3.5" />
						)}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Close"
						onClick={onClose}
					>
						<X className="size-4" />
					</Button>
				</div>
			</header>

			<motion.div
				className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
				variants={reduce ? undefined : listVariants}
				initial={reduce ? false : "hidden"}
				animate={reduce ? false : "show"}
			>
				<motion.div variants={reduce ? undefined : itemVariants}>
					<EditableTitle
						value={task.title}
						disabled={isUpdating}
						onSave={(title) => onUpdate({ title })}
					/>
				</motion.div>

				<motion.div
					variants={reduce ? undefined : itemVariants}
					className="flex flex-wrap items-center gap-2"
				>
					<StatusSelect
						status={task.status}
						options={statusOptions.length ? statusOptions : [task.status]}
						disabled={isUpdating}
						onChange={(statusId) => onUpdate({ statusId })}
					/>
					{task.provider !== "github" ? (
						<PrioritySelect
							priority={task.priority}
							disabled={isUpdating}
							onChange={(priority) => onUpdate({ priority })}
						/>
					) : null}
					<AssigneeSelect
						assignee={task.assignee}
						options={assigneeOptions}
						disabled={isUpdating}
						onChange={(assigneeId) => onUpdate({ assigneeId })}
					/>
					{task.provider !== "github" && task.project ? (
						<Badge variant="outline" className="gap-1.5 font-normal">
							<ProjectIcon project={task.project} size={12} />
							{task.project.name}
						</Badge>
					) : null}
				</motion.div>

				<motion.div variants={reduce ? undefined : itemVariants}>
					<LabelSelect
						value={task.labels}
						options={labelOptions}
						disabled={isUpdating}
						onChange={(labelIds) => onUpdate({ labelIds })}
					/>
				</motion.div>

				<motion.div variants={reduce ? undefined : itemVariants}>
					<p className="mb-1 font-medium text-muted-foreground text-small uppercase tracking-wide">
						Description
					</p>
					<DescriptionEditor
						value={task.description}
						disabled={isUpdating}
						onSave={(description) => onUpdate({ description })}
					/>
				</motion.div>

				{task.agentFeedback ? (
					<motion.div
						variants={reduce ? undefined : itemVariants}
						className="rounded-lg border border-border/50 bg-muted/30 p-3"
					>
						<p className="mb-1 flex items-center gap-1.5 font-medium text-small text-foreground">
							<Bot className="size-3.5" />
							Agent feedback
						</p>
						<p className="whitespace-pre-wrap text-muted-foreground text-small leading-relaxed">
							{task.agentFeedback}
						</p>
					</motion.div>
				) : null}
			</motion.div>

			{(onReview || onStartWorkspace) && (
				<footer className="flex items-center gap-2 border-border/40 border-t px-4 py-3">
					{onReview ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={reviewPending}
							onClick={onReview}
						>
							<Bot className="size-3.5" />
							{reviewPending ? "Reviewing…" : "Ask agent to review"}
						</Button>
					) : null}
					{onStartWorkspace ? (
						<Button type="button" size="sm" onClick={onStartWorkspace}>
							<GitBranch className="size-3.5" />
							Start workspace
						</Button>
					) : null}
				</footer>
			)}
		</div>
	);
}
