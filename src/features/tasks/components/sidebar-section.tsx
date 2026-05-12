import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function SidebarSection({
	title,
	count,
	editTrigger,
	isPending,
	children,
}: {
	title: string;
	count?: number;
	editTrigger?: ReactNode;
	/** Dims the content + shows a spinner in the header while a
	 *  mutation tied to this section is in flight. */
	isPending?: boolean;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-1.5 border-border/40 border-b py-3 first:pt-0 last:border-b-0">
			<header className="flex items-center justify-between">
				<div className="flex items-baseline gap-1.5">
					<h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
						{title}
					</h3>
					{typeof count === "number" && count > 0 ? (
						<span className="rounded-sm bg-foreground/10 px-1 font-medium text-[10px] tabular-nums text-foreground/80">
							{count}
						</span>
					) : null}
					{isPending ? (
						<Loader2
							className="size-3 animate-spin text-muted-foreground/70"
							strokeWidth={2}
							aria-label="Saving"
						/>
					) : null}
				</div>
				{editTrigger ?? null}
			</header>
			<div
				className={`text-[12px] text-foreground/90 transition-opacity ${
					isPending ? "pointer-events-none opacity-60" : ""
				}`}
			>
				{children}
			</div>
		</section>
	);
}
