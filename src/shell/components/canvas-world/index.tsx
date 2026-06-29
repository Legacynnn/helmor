import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useSpaceStore } from "@/features/canvas/use-space-store";
import { workspaceGroupsQueryOptions } from "@/lib/query-client";
import { MissionControl } from "./mission-control";

const CanvasSurface = lazy(() =>
	import("@/features/canvas").then((m) => ({ default: m.CanvasSurface })),
);

/**
 * The full-bleed Canvas world. Replaces the normal 3-column layout when the
 * active space is "canvas". Shows mission-control (a grid of canvas-workspace
 * tiles) by default, or zooms into a single workspace's canvas. Owns its own
 * selection — independent of the normal sidebar/router selection.
 */
export function CanvasWorld({
	onSelectWorkspace,
	onNewCanvas,
}: {
	onSelectWorkspace?: (workspaceId: string) => void;
	onNewCanvas?: () => void;
}) {
	const remembered = useSpaceStore((s) => s.lastSelected.canvas ?? null);
	const remember = useSpaceStore((s) => s.rememberSelection);
	const [selected, setSelected] = useState<string | null>(remembered);
	const { data } = useQuery(workspaceGroupsQueryOptions());

	const tiles = (data ?? [])
		.flatMap((group) => group.rows)
		.filter((row) => row.space === "canvas")
		.map((row) => ({ id: row.id, title: row.title }));

	// The remembered canvas workspace may have been archived/converted; fall
	// back to the overview if it's no longer a live canvas tile.
	const activeSelection =
		selected && tiles.some((t) => t.id === selected) ? selected : null;

	if (!activeSelection) {
		return (
			<MissionControl
				workspaces={tiles}
				onOpen={(id) => {
					remember("canvas", id);
					onSelectWorkspace?.(id);
					setSelected(id);
				}}
				onCreate={() => onNewCanvas?.()}
			/>
		);
	}

	return (
		<div className="relative size-full">
			<button
				type="button"
				onClick={() => setSelected(null)}
				aria-label="Back to canvas overview"
				className="absolute top-3 left-3 z-10 flex cursor-pointer items-center gap-1 rounded-md bg-app-base/80 px-2 py-1 text-app-foreground text-xs shadow-sm backdrop-blur transition-colors hover:bg-app-base"
			>
				<ArrowLeft className="size-3.5" /> Overview
			</button>
			<Suspense
				fallback={
					<div className="flex size-full items-center justify-center bg-app-base text-app-muted-foreground text-sm">
						Loading canvas…
					</div>
				}
			>
				<CanvasSurface key={activeSelection} workspaceId={activeSelection} />
			</Suspense>
		</div>
	);
}
