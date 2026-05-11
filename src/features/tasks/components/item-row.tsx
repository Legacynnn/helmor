import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronRight } from "lucide-react";
import type { TaskListItem } from "../types";

const PRIORITY_GLYPH: Record<NonNullable<TaskListItem["priority"]>, string> = {
	urgent: "■",
	high: "▮",
	medium: "▬",
	low: "▭",
	none: "·",
};

function relative(dateIso: string): string {
	const then = new Date(dateIso).getTime();
	if (Number.isNaN(then)) return "";
	const diffSec = Math.round((Date.now() - then) / 1000);
	const day = 86_400;
	if (diffSec < day) return "today";
	if (diffSec < day * 7) return `${Math.round(diffSec / day)}d ago`;
	if (diffSec < day * 30) return `${Math.round(diffSec / (day * 7))}w ago`;
	if (diffSec < day * 365) return `${Math.round(diffSec / (day * 30))}mo ago`;
	return `${Math.round(diffSec / (day * 365))}y ago`;
}

export function ItemRow({ item }: { item: TaskListItem }) {
	return (
		<button
			type="button"
			onClick={() => void openUrl(item.url)}
			className="group flex w-full cursor-pointer items-center gap-2 border-b border-border/50 px-4 py-1.5 text-left text-xs hover:bg-muted/40"
		>
			<span
				className="w-3 shrink-0 text-center text-muted-foreground"
				aria-hidden="true"
				title={item.priority ?? "none"}
			>
				{PRIORITY_GLYPH[item.priority ?? "none"]}
			</span>
			<span className="w-24 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
				{item.displayId}
			</span>
			<span className="min-w-0 flex-1 truncate">{item.title}</span>
			<span className="ml-auto flex shrink-0 items-center gap-1.5">
				{item.labels.slice(0, 3).map((label) => (
					<span
						key={label.name}
						className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
						style={{ color: label.color }}
					>
						{label.name}
					</span>
				))}
				{item.assignee ? (
					<span className="size-5 shrink-0 rounded-full bg-muted text-center text-[10px] leading-5">
						{item.assignee.login.slice(0, 1).toUpperCase()}
					</span>
				) : null}
				<span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
					{relative(item.updatedAt)}
				</span>
				<ChevronRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
			</span>
		</button>
	);
}
