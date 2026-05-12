import { CheckCircle2, CircleSlash, RotateCw } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { InboxItemDetailRef } from "@/lib/api";
import { useIssueEdit } from "../hooks/use-issue-edit";
import type { TaskListItem } from "../types";

type Props = {
	status: TaskListItem["status"];
	state: string;
	updatedAt: string | null;
	detailRef: InboxItemDetailRef | null;
	detailQueryKey: readonly unknown[];
	editable: boolean;
};

export function StatusBadgeMenu({
	status,
	state,
	updatedAt,
	detailRef,
	detailQueryKey,
	editable,
}: Props) {
	const editor = useIssueEdit({
		detailRef: detailRef ?? ({} as InboxItemDetailRef),
		detailQueryKey,
		field: "state",
		readField: (detail) => detail.state,
	});

	const badge = (
		<span
			className="rounded-full border px-2 py-0.5 text-[12px] font-semibold transition-shadow"
			style={{
				color: status.color,
				borderColor: `color-mix(in oklab, ${status.color} 35%, transparent)`,
				backgroundImage: `linear-gradient(135deg, color-mix(in oklab, ${status.color} 28%, transparent), color-mix(in oklab, ${status.color} 8%, transparent))`,
			}}
		>
			{status.label}
		</span>
	);

	if (!editable || !detailRef) {
		return badge;
	}

	const isOpen = state.toLowerCase() === "open";

	const close = (reason: "completed" | "not_planned") =>
		void editor.save({ state: "closed", stateReason: reason }, updatedAt);

	const reopen = () =>
		void editor.save({ state: "open", stateReason: "reopened" }, updatedAt);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Change issue state"
					disabled={editor.isSaving}
					className="cursor-pointer rounded-full outline-none ring-foreground/15 transition-shadow hover:ring-1 focus-visible:ring-2"
				>
					{badge}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-[12rem]">
				{isOpen ? (
					<>
						<DropdownMenuItem
							onSelect={() => close("completed")}
							className="cursor-pointer gap-2"
						>
							<CheckCircle2 className="size-[14px] text-emerald-500" />
							Close as completed
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => close("not_planned")}
							className="cursor-pointer gap-2"
						>
							<CircleSlash className="size-[14px] text-muted-foreground" />
							Close as not planned
						</DropdownMenuItem>
					</>
				) : (
					<DropdownMenuItem onSelect={reopen} className="cursor-pointer gap-2">
						<RotateCw className="size-[14px] text-emerald-500" />
						Reopen issue
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
