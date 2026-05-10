import { cn } from "@/lib/utils";

export type DiffStatsBadgeProps = {
	additions?: number;
	deletions?: number;
	className?: string;
};

export function DiffStatsBadge({
	additions = 0,
	deletions = 0,
	className,
}: DiffStatsBadgeProps) {
	if (additions <= 0 && deletions <= 0) {
		return null;
	}

	return (
		<span
			className={cn(
				"flex items-center gap-0.5 font-medium tabular-nums",
				className,
			)}
		>
			{additions > 0 ? (
				<span className="text-chart-2">+{additions}</span>
			) : null}
			{deletions > 0 ? (
				<span className="text-destructive">−{deletions}</span>
			) : null}
		</span>
	);
}
