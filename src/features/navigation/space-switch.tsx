import { LayoutGrid, PanelsTopLeft } from "lucide-react";
import {
	useActiveSpace,
	useSpaceStore,
} from "@/features/canvas/use-space-store";
import type { WorkspaceSpace } from "@/lib/api";
import { cn } from "@/lib/utils";

const TABS: ReadonlyArray<{
	id: WorkspaceSpace;
	label: string;
	Icon: typeof PanelsTopLeft;
}> = [
	{ id: "normal", label: "Workspaces", Icon: PanelsTopLeft },
	{ id: "canvas", label: "Canvas", Icon: LayoutGrid },
];

/**
 * Segmented switch between the two workspace worlds. A sliding pill tracks the
 * active space; flipping it drives the top-level layout (normal 3-column vs.
 * full-bleed canvas world).
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
			className="relative flex h-8 rounded-lg bg-muted/60 p-0.5"
		>
			{/* Sliding active indicator */}
			<div
				aria-hidden
				className="absolute inset-y-0.5 left-0.5 rounded-md bg-background shadow-sm ring-1 ring-border/60 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
				style={{
					width: `calc(${100 / TABS.length}% - 2px)`,
					transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 2}px))`,
				}}
			/>
			{TABS.map(({ id, label, Icon }) => {
				const isActive = active === id;
				return (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={isActive}
						onClick={() => setActiveSpace(id)}
						className={cn(
							"relative z-10 flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium text-xs transition-colors",
							isActive
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Icon
							className={cn(
								"size-3.5 transition-colors",
								isActive && "text-foreground",
							)}
						/>
						{label}
					</button>
				);
			})}
		</div>
	);
}
