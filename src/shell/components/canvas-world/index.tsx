import { useQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import { lazy, Suspense } from "react";
import { useCanvasSidebarStore } from "@/features/canvas/use-canvas-sidebar-store";
import { useSpaceStore } from "@/features/canvas/use-space-store";
import { workspaceGroupsQueryOptions } from "@/lib/query-client";
import { CanvasSidebar } from "./canvas-sidebar";

const CanvasSurface = lazy(() =>
	import("@/features/canvas").then((m) => ({ default: m.CanvasSurface })),
);

/**
 * The Canvas world. Replaces the normal 3-column layout when the active space is
 * "canvas". A dedicated canvas sidebar (list + hover previews + management)
 * floats over the left; the selected workspace's full canvas fills the whole
 * area behind it. Owns its own selection, independent of the normal
 * sidebar/router. The sidebar toggles (rail button / ⌘B) and hides entirely
 * when collapsed so the canvas runs edge-to-edge.
 */
export function CanvasWorld({
	onSelectWorkspace,
}: {
	onSelectWorkspace?: (workspaceId: string) => void;
}) {
	const remembered = useSpaceStore((s) => s.lastSelected.canvas ?? null);
	const remember = useSpaceStore((s) => s.rememberSelection);
	const sidebarOpen = useCanvasSidebarStore((s) => s.open);
	const { data } = useQuery(workspaceGroupsQueryOptions());

	const canvasRows = (data ?? [])
		.flatMap((group) => group.rows)
		.filter((row) => row.space === "canvas");

	// The remembered canvas may have been archived/deleted; fall back to none.
	const selected =
		remembered && canvasRows.some((r) => r.id === remembered)
			? remembered
			: null;

	const openCanvas = (id: string) => {
		remember("canvas", id);
		onSelectWorkspace?.(id);
	};

	return (
		<div className="relative size-full min-w-0">
			{selected ? (
				<Suspense
					fallback={
						<div className="flex size-full items-center justify-center bg-background text-muted-foreground text-sm">
							Loading canvas…
						</div>
					}
				>
					<CanvasSurface key={selected} workspaceId={selected} />
				</Suspense>
			) : (
				<div className="flex size-full flex-col items-center justify-center gap-3 bg-white text-muted-foreground dark:bg-neutral-950">
					<LayoutGrid className="size-10 opacity-40" />
					<p className="text-sm">
						{canvasRows.length === 0
							? "Create a canvas to get started."
							: "Select a canvas from the sidebar, or create a new one."}
					</p>
				</div>
			)}
			{sidebarOpen ? (
				<CanvasSidebar selectedId={selected} onSelect={openCanvas} />
			) : null}
		</div>
	);
}
