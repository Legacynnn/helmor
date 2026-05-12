import { GroupIcon, groupToneClasses } from "@/features/navigation/shared";
import { cn } from "@/lib/utils";
import { taskStatusTone } from "./status-tone";
import type { TaskListItem } from "./types";

export function TaskStatusIcon({ status }: { status: TaskListItem["status"] }) {
	const tone = taskStatusTone(status);
	if (tone === "todo") {
		return (
			<span
				aria-hidden="true"
				className={cn(
					"block size-[14px] shrink-0 rounded-full border border-current",
					groupToneClasses.pinned,
				)}
			/>
		);
	}
	return <GroupIcon tone={tone} />;
}
