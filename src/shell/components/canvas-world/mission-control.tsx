import { Plus } from "lucide-react";

export type CanvasTile = { id: string; title: string };

/**
 * The Canvas world's "mission control": a grid of canvas-workspace tiles plus
 * a prominent create tile. Selecting a tile zooms into that workspace's canvas;
 * the create tile starts a new canvas workspace.
 */
export function MissionControl({
	workspaces,
	onOpen,
	onCreate,
}: {
	workspaces: CanvasTile[];
	onOpen: (id: string) => void;
	onCreate: () => void;
}) {
	return (
		<div className="grid size-full auto-rows-[180px] grid-cols-[repeat(auto-fill,minmax(260px,1fr))] content-start gap-4 overflow-auto bg-app-base p-6">
			{workspaces.map((w) => (
				<button
					key={w.id}
					type="button"
					onClick={() => onOpen(w.id)}
					className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-app-border bg-app-muted text-left transition-shadow hover:shadow-md"
				>
					<div className="flex-1 bg-app-base/40" aria-hidden />
					<div className="truncate border-app-border border-t px-3 py-2 text-app-foreground text-sm">
						{w.title}
					</div>
				</button>
			))}
			<button
				type="button"
				onClick={onCreate}
				aria-label="New canvas"
				className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-app-border border-dashed text-app-muted-foreground transition-colors hover:text-app-foreground"
			>
				<Plus className="size-6" />
				<span className="text-sm">New canvas</span>
			</button>
		</div>
	);
}
