import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IssueEditConflict } from "../hooks/use-issue-edit";

type Props = {
	conflict: IssueEditConflict;
	onReload: () => void;
	onOverwrite: () => void;
	onDismiss: () => void;
};

function relativeShort(iso: string | null): string {
	if (!iso) return "recently";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "recently";
	const diff = Math.max(0, Date.now() - date.getTime());
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

const FIELD_LABEL: Record<IssueEditConflict["field"], string> = {
	title: "title",
	body: "description",
	state: "state",
};

export function ConflictBanner({
	conflict,
	onReload,
	onOverwrite,
	onDismiss,
}: Props) {
	return (
		<div
			role="alert"
			className="mb-3 flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-200"
		>
			<AlertTriangle
				className="mt-0.5 size-[14px] shrink-0"
				strokeWidth={1.8}
			/>
			<div className="min-w-0 flex-1">
				<p className="font-medium">
					The {FIELD_LABEL[conflict.field]} was changed on GitHub{" "}
					{relativeShort(conflict.remoteUpdatedAt)}.
				</p>
				<p className="mt-0.5 text-amber-200/80">
					Your changes haven't been saved. Reload to see the latest version, or
					overwrite to save yours.
				</p>
				<div className="mt-2 flex items-center gap-2">
					<Button
						type="button"
						size="sm"
						onClick={onReload}
						className="h-7 cursor-pointer"
					>
						Reload
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onOverwrite}
						className="h-7 cursor-pointer"
					>
						Overwrite
					</Button>
				</div>
			</div>
			<button
				type="button"
				aria-label="Dismiss"
				onClick={onDismiss}
				className="cursor-pointer text-amber-200/70 hover:text-amber-200"
			>
				<X className="size-[14px]" strokeWidth={1.8} />
			</button>
		</div>
	);
}
