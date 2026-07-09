import type { WorkspaceMode } from "@/lib/api";
import type { ActiveScreen } from "@/shell/controllers/use-screen-controller";

/**
 * Whether the right-hand inspector — and, crucially, its `position: absolute`
 * resize separator — should mount.
 *
 * The inspector and its separator live in the *normal-world* half of the sliding
 * two-world track (see {@link ./app-shell-layout.tsx}). When the canvas world is
 * active the track carries `transform: translateX(-50%)`, and a transform
 * establishes a containing block for absolutely-positioned descendants. That
 * makes the separator's `right` offset resolve against the (200%-wide) track
 * instead of the normal-world column, so it lands over the *visible canvas* — a
 * phantom, nearly-invisible (`w-px bg-border`) draggable strip that also
 * intercepts canvas pan/scroll via its full-height `z-30 touch-none` hit area.
 *
 * Gating the whole inspector block on `!canvasActive` keeps every piece of the
 * normal-world inspector off the canvas, which both removes the ghost strip and
 * restores smooth canvas navigation.
 */
export function shouldShowInspector(input: {
	canvasActive: boolean;
	activeScreen: ActiveScreen;
	rightSidebarAvailable: boolean;
	workspaceMode: WorkspaceMode | null | undefined;
}): boolean {
	const { canvasActive, activeScreen, rightSidebarAvailable, workspaceMode } =
		input;
	return (
		!canvasActive &&
		activeScreen === "none" &&
		rightSidebarAvailable &&
		workspaceMode !== "chat"
	);
}
