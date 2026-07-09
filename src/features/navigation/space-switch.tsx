import {
	useActiveSpace,
	useSpaceStore,
} from "@/features/canvas/use-space-store";
import type { WorkspaceSpace } from "@/lib/api";
import { cn } from "@/lib/utils";

const TABS: ReadonlyArray<{ id: WorkspaceSpace; label: string }> = [
	{ id: "normal", label: "Threads" },
	{ id: "canvas", label: "Canvas" },
];

/**
 * Segmented switch between the two workspace worlds — a macOS-style control:
 * an inset track with a sliding raised pill on the active tab and plain labels
 * (no icons). Flipping it drives the top-level layout (normal 3-column vs.
 * full-bleed canvas world).
 *
 * NOTE: colours use the real registered `foreground` token (via `/alpha`), not
 * the non-existent `app-foreground` utility — the latter silently produces no
 * background, which is why an earlier revision rendered as bare text.
 */
export function SpaceSwitch() {
	const active = useActiveSpace();
	const setActiveSpace = useSpaceStore((s) => s.setActiveSpace);
	const activeIndex = Math.max(
		0,
		TABS.findIndex((t) => t.id === active),
	);
	return (
		<div
			role="tablist"
			aria-label="Workspace space"
			className="relative flex h-9 rounded-[10px] bg-foreground/[0.06] p-1"
		>
			{/* Sliding active indicator — a raised pill, clearly lighter than the
			 *  track, defined by its fill + a soft shadow (no border/ring). */}
			<div
				aria-hidden
				className="absolute inset-y-1 left-1 rounded-md bg-foreground/[0.14] shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
				style={{
					width: `calc(${100 / TABS.length}% - 4px)`,
					transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 4}px))`,
				}}
			/>
			{TABS.map(({ id, label }) => {
				const isActive = active === id;
				return (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={isActive}
						onClick={() => setActiveSpace(id)}
						className={cn(
							"relative z-10 flex flex-1 cursor-pointer items-center justify-center rounded-md font-medium text-[13px] transition-colors",
							isActive
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground/80",
						)}
					>
						{label}
					</button>
				);
			})}
		</div>
	);
}
