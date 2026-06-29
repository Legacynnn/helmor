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
 * Segmented switch between the two workspace worlds. Flipping the active space
 * drives the top-level layout (normal 3-column vs. full-bleed canvas world).
 */
export function SpaceSwitch() {
	const active = useActiveSpace();
	const setActiveSpace = useSpaceStore((s) => s.setActiveSpace);
	return (
		<div role="tablist" className="flex gap-1 rounded-lg bg-app-muted p-1">
			{TABS.map(({ id, label, Icon }) => (
				<button
					key={id}
					type="button"
					role="tab"
					aria-selected={active === id}
					onClick={() => setActiveSpace(id)}
					className={cn(
						"flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1 font-medium text-xs transition-colors",
						active === id
							? "bg-app-base text-app-foreground shadow-sm"
							: "text-app-muted-foreground hover:text-app-foreground",
					)}
				>
					<Icon className="size-3.5" />
					{label}
				</button>
			))}
		</div>
	);
}
