import { cn } from "@/lib/utils";

export type TopSectionView = "files" | "changes" | "checks";

export type ChecksIndicator = "none" | "pending" | "failure";

interface Props {
	value: TopSectionView;
	onChange: (value: TopSectionView) => void;
	changesCount?: number | null;
	checksIndicator?: ChecksIndicator;
}

export function TopSectionTabs({
	value,
	onChange,
	changesCount,
	checksIndicator = "none",
}: Props) {
	return (
		<div className="flex h-7 items-center gap-1 rounded-md bg-muted/40 p-0.5">
			<TabButton active={value === "files"} onClick={() => onChange("files")}>
				All files
			</TabButton>
			<TabButton
				active={value === "changes"}
				onClick={() => onChange("changes")}
			>
				Changes
				{typeof changesCount === "number" && changesCount > 0 ? (
					<span className="ml-1 rounded-sm bg-foreground/10 px-1 text-[10px] font-medium text-foreground/80">
						{changesCount}
					</span>
				) : null}
			</TabButton>
			<TabButton active={value === "checks"} onClick={() => onChange("checks")}>
				Checks
				{checksIndicator !== "none" ? (
					<span
						aria-label={
							checksIndicator === "failure"
								? "Checks have failures"
								: "Checks pending"
						}
						className={cn(
							"ml-1 inline-block size-1.5 rounded-full",
							checksIndicator === "failure" ? "bg-destructive" : "bg-amber-500",
						)}
					/>
				) : null}
			</TabButton>
		</div>
	);
}

function TabButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex h-6 flex-1 cursor-pointer items-center justify-center rounded-sm px-2 text-[11.5px] font-medium",
				active
					? "bg-background text-foreground shadow-sm"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}
