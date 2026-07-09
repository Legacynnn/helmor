// Assembly layout for the whole app surface. Holds the static DOM frame (the
// <main> + the sidebar / workspace-pane / inspector three-column grid) and the
// provider stack + overlays around it. All data/handlers arrive pre-computed
// from the AppShell orchestration layer as grouped child-prop bags — this file
// is pure structure + wiring, no state of its own. Lifted verbatim out of
// AppShell's return; the header memo nodes stay computed upstream and ride in
// via `workspacePane`.
import type { ComponentProps, KeyboardEvent, PointerEvent } from "react";
import { FeedbackDialog } from "@/features/feedback";
import type { WorkspaceDetail } from "@/lib/api";
import type { ActiveScreen } from "@/shell/controllers/use-screen-controller";
import type { ShellViewMode } from "@/shell/controllers/use-selection-controller";
import { AppOverlays } from "./app-overlays";
import { AppShellProviderStack } from "./app-shell-provider-stack";
// CanvasWorld is light at import time; the heavy tldraw canvas it renders is
// itself lazy-loaded inside CanvasWorld, so it stays out of the main bundle and
// out of shell tests' module graph until a canvas workspace is actually opened.
import { CanvasWorld } from "./canvas-world";
import { ScreenHost } from "./screen-host";
import { ShellInspectorPane } from "./shell-inspector-pane";
import { ShellResizeSeparator } from "./shell-resize-separator";
import { ShellSidebarPane } from "./shell-sidebar-pane";
import { shouldShowInspector } from "./should-show-inspector";
import { WorkspacePaneSurface } from "./workspace-pane-surface";

type ResizeTarget = "sidebar" | "inspector";

type Props = {
	providerStack: Omit<ComponentProps<typeof AppShellProviderStack>, "children">;
	feedbackOpen: boolean;
	onFeedbackOpenChange: (open: boolean) => void;
	onOpenSettings: ComponentProps<typeof FeedbackDialog>["onOpenSettings"];
	onSubmitFeedbackPrompt: ComponentProps<
		typeof FeedbackDialog
	>["onSubmitPrompt"];
	workspaceViewMode: ShellViewMode;
	activeScreen: ActiveScreen;
	// Canvas space: when active, the full-bleed Canvas world replaces the normal
	// 3-column layout and the sidebar slides away.
	canvasActive: boolean;
	onSelectWorkspace: (workspaceId: string | null) => void;
	// Left sidebar + its resize separator.
	sidebar: ComponentProps<typeof ShellSidebarPane>;
	sidebarCollapsed: boolean;
	isSidebarResizing: boolean;
	sidebarWidth: number;
	// Center pane.
	workspacePane: ComponentProps<typeof WorkspacePaneSurface>;
	// Right inspector + its resize separator + visibility gate.
	rightSidebarAvailable: boolean;
	selectedWorkspaceDetail: WorkspaceDetail | null;
	inspector: ComponentProps<typeof ShellInspectorPane>;
	inspectorCollapsed: boolean;
	isInspectorResizing: boolean;
	inspectorWidth: number;
	handleResizeStart: (
		target: ResizeTarget,
	) => (event: PointerEvent<HTMLDivElement>) => void;
	handleResizeKeyDown: (
		target: ResizeTarget,
	) => (event: KeyboardEvent<HTMLDivElement>) => void;
	overlays: ComponentProps<typeof AppOverlays>;
};

export function AppShellLayout({
	providerStack,
	feedbackOpen,
	onFeedbackOpenChange,
	onOpenSettings,
	onSubmitFeedbackPrompt,
	workspaceViewMode,
	activeScreen,
	canvasActive,
	onSelectWorkspace,
	sidebar,
	sidebarCollapsed,
	isSidebarResizing,
	sidebarWidth,
	workspacePane,
	rightSidebarAvailable,
	selectedWorkspaceDetail,
	inspector,
	inspectorCollapsed,
	isInspectorResizing,
	inspectorWidth,
	handleResizeStart,
	handleResizeKeyDown,
	overlays,
}: Props) {
	return (
		<AppShellProviderStack {...providerStack}>
			{/* Conditionally mount so closing the dialog tears the tree
			 *  down via React directly instead of waiting on Radix
			 *  Presence + `animationend`. In WKWebview the workspace
			 *  switch that fires from "Send to agent" can flip
			 *  `document.hidden` to true mid-animation, which pauses
			 *  the exit keyframes indefinitely — `animationend`
			 *  never fires, Presence never unmounts, and the closed
			 *  dialog lingers as a ghost over the new conversation. */}
			{feedbackOpen ? (
				<FeedbackDialog
					open={feedbackOpen}
					onOpenChange={onFeedbackOpenChange}
					onOpenSettings={onOpenSettings}
					onSubmitPrompt={onSubmitFeedbackPrompt}
				/>
			) : null}
			<main
				aria-label="Application shell"
				className="relative h-dvh overflow-hidden bg-background font-sans text-foreground antialiased"
			>
				{/* Two worlds on one horizontal track: the normal 3-column layout and
				 *  the full-bleed Canvas world. The track slides between them when the
				 *  active space flips (the sidebar's Workspaces|Canvas switch). Both
				 *  panes stay mounted so switching back is instant. */}
				<div className="relative h-full min-h-0 overflow-hidden bg-background">
					<div
						className="flex h-full w-[200%] transition-transform duration-300 ease-out"
						style={{
							transform: canvasActive ? "translateX(-50%)" : "translateX(0)",
						}}
					>
						{/* Normal world */}
						<div className="flex h-full w-1/2 min-w-0">
							{workspaceViewMode !== "editor" && (
								<>
									<ShellSidebarPane {...sidebar} />
									<ShellResizeSeparator
										side="sidebar"
										collapsed={sidebarCollapsed}
										resizing={isSidebarResizing}
										width={sidebarWidth}
										onPointerDown={handleResizeStart("sidebar")}
										onKeyDown={handleResizeKeyDown("sidebar")}
									/>
								</>
							)}

							{activeScreen === "none" ? (
								<WorkspacePaneSurface {...workspacePane} />
							) : (
								<ScreenHost
									activeScreen={activeScreen}
									selectionActions={workspacePane.selectionActions}
									screenActions={sidebar.screenActions}
								/>
							)}

							{/* Gated on `!canvasActive`: the inspector's resize separator is
							 *  `position: absolute`, and the canvas world's `translateX(-50%)`
							 *  track transform would otherwise make its `right` offset resolve
							 *  against the full track and float a ghost draggable strip over the
							 *  canvas (which also swallowed pan/scroll). See shouldShowInspector. */}
							{shouldShowInspector({
								canvasActive,
								activeScreen,
								rightSidebarAvailable,
								workspaceMode: selectedWorkspaceDetail?.mode,
							}) && (
								<>
									<ShellResizeSeparator
										side="inspector"
										collapsed={inspectorCollapsed}
										resizing={isInspectorResizing}
										width={inspectorWidth}
										onPointerDown={handleResizeStart("inspector")}
										onKeyDown={handleResizeKeyDown("inspector")}
									/>
									<ShellInspectorPane {...inspector} />
								</>
							)}
						</div>

						{/* Canvas world */}
						<div className="h-full w-1/2 min-w-0">
							<CanvasWorld onSelectWorkspace={onSelectWorkspace} />
						</div>
					</div>
				</div>
			</main>
			<AppOverlays {...overlays} />
		</AppShellProviderStack>
	);
}
