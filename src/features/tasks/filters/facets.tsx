import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type {
	IntegrationProvider,
	Task,
	TaskPriority,
	TaskProject,
} from "@/lib/api";
import { ProjectIcon } from "../components/project-icon";
import { TaskPriorityIcon } from "../components/task-priority-icon";

/**
 * Provider-agnostic faceted filtering. A `TaskFacet` knows how to (a) pull the
 * facet keys off a normalized `Task` and (b) derive the selectable options from
 * the loaded task set plus an optional provider-supplied context (e.g. the full
 * project list, so options include projects with no synced issues). Because
 * facets operate on the normalized `Task` shape, they're reusable across
 * providers — each provider just declares *which* facets it exposes via
 * `facetsForProvider`.
 */

export const NONE_KEY = "__none__";

export type FacetOption = {
	key: string;
	label: string;
	icon?: ReactNode;
	swatch?: string | null;
};

/** Provider-fetched reference data the facets can fold into their options. */
export type FacetContext = {
	projects?: TaskProject[];
};

export type TaskFacet = {
	id: string;
	label: string;
	/** Keys this task matches for the facet (multi-valued, e.g. labels). */
	taskKeys: (task: Task) => string[];
	/** Selectable options, derived from the loaded tasks + optional context. */
	options: (tasks: Task[], context?: FacetContext) => FacetOption[];
};

const PRIORITY_ORDER: TaskPriority[] = [
	"urgent",
	"high",
	"medium",
	"low",
	"none",
];
const PRIORITY_LABEL: Record<TaskPriority, string> = {
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
	none: "No priority",
};

const priorityFacet: TaskFacet = {
	id: "priority",
	label: "Priority",
	taskKeys: (task) => [task.priority],
	options: (tasks) => {
		const present = new Set(tasks.map((t) => t.priority));
		return PRIORITY_ORDER.filter((p) => present.has(p)).map((p) => ({
			key: p,
			label: PRIORITY_LABEL[p],
			icon: <TaskPriorityIcon priority={p} size={14} />,
		}));
	},
};

const assigneeFacet: TaskFacet = {
	id: "assignee",
	label: "Assignee",
	taskKeys: (task) => [task.assignee ? task.assignee.id : NONE_KEY],
	options: (tasks) => {
		const seen = new Map<string, FacetOption>();
		let hasNone = false;
		for (const task of tasks) {
			if (!task.assignee) {
				hasNone = true;
				continue;
			}
			if (!seen.has(task.assignee.id)) {
				const a = task.assignee;
				seen.set(a.id, {
					key: a.id,
					label: a.name,
					icon: (
						<Avatar className="size-4">
							{a.avatarUrl ? (
								<AvatarImage src={a.avatarUrl} alt={a.name} />
							) : null}
							<AvatarFallback className="text-[8px]">
								{a.name.slice(0, 2).toUpperCase()}
							</AvatarFallback>
						</Avatar>
					),
				});
			}
		}
		const out = [...seen.values()].sort((a, b) =>
			a.label.localeCompare(b.label),
		);
		if (hasNone) out.push({ key: NONE_KEY, label: "No assignee" });
		return out;
	},
};

const projectFacet: TaskFacet = {
	id: "project",
	label: "Project",
	taskKeys: (task) => [task.project ? task.project.id : NONE_KEY],
	options: (tasks, context) => {
		const seen = new Map<string, FacetOption>();
		// Seed with the full project list (so projects with no synced issues
		// still appear), then fold in any project present on a task.
		for (const project of context?.projects ?? []) {
			seen.set(project.id, {
				key: project.id,
				label: project.name,
				icon: <ProjectIcon project={project} size={14} />,
			});
		}
		let hasNone = false;
		for (const task of tasks) {
			if (!task.project) {
				hasNone = true;
				continue;
			}
			if (!seen.has(task.project.id)) {
				seen.set(task.project.id, {
					key: task.project.id,
					label: task.project.name,
					icon: <ProjectIcon project={task.project} size={14} />,
				});
			}
		}
		const out = [...seen.values()].sort((a, b) =>
			a.label.localeCompare(b.label),
		);
		if (hasNone) out.push({ key: NONE_KEY, label: "No project" });
		return out;
	},
};

const labelFacet: TaskFacet = {
	id: "label",
	label: "Tags",
	taskKeys: (task) => task.labels.map((l) => l.id),
	options: (tasks) => {
		const seen = new Map<string, FacetOption>();
		for (const task of tasks) {
			for (const label of task.labels) {
				if (!seen.has(label.id)) {
					seen.set(label.id, {
						key: label.id,
						label: label.name,
						swatch: label.color ?? "#8b8b8b",
					});
				}
			}
		}
		return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
	},
};

/** Facets exposed per provider. Linear surfaces project / assignee / priority /
 * tags; other providers can return a different set without touching the bar. */
export function facetsForProvider(provider: IntegrationProvider): TaskFacet[] {
	switch (provider) {
		default:
			return [projectFacet, assigneeFacet, priorityFacet, labelFacet];
	}
}
