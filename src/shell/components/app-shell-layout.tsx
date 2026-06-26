// Assembly layout for the whole app surface. Holds the static DOM frame (the
// <main> + the sidebar / workspace-pane / inspector three-column grid) and the
// provider stack + overlays around it. All data/handlers arrive pre-computed
// from the AppShell orchestration layer as grouped child-prop bags — this file
// is pure structure + wiring, no state of its own. Lifted verbatim out of
// AppShell's return; the header memo nodes stay computed upstream and ride in
// via `workspacePane`.
import {
	type ComponentProps,
	type KeyboardEvent,
	lazy,
	type PointerEvent,
	Suspense,
} from "react";
import { FeedbackDialog } from "@/features/feedback";
import type { WorkspaceDetail } from "@/lib/api";
import type { ActiveScreen } from "@/shell/controllers/use-screen-controller";
import type { ShellViewMode } from "@/shell/controllers/use-selection-controller";
import { AppOverlays } from "./app-overlays";
import { AppShellProviderStack } from "./app-shell-provider-stack";
import { ScreenHost } from "./screen-host";
import { ShellInspectorPane } from "./shell-inspector-pane";
import { ShellResizeSeparator } from "./shell-resize-separator";
import { ShellSidebarPane } from "./shell-sidebar-pane";
import { WorkspacePaneSurface } from "./workspace-pane-surface";

// Lazy: tldraw is heavy and pulled in only when canvas mode is active. Keeps it
// out of the main bundle AND out of every shell test's module graph (tldraw
// touches CSS.supports at import, which jsdom lacks).
const CanvasSurface = lazy(() =>
	import("@/features/canvas").then((m) => ({ default: m.CanvasSurface })),
);

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
	// Infinite Canvas mode (epic #61): replaces the center + inspector with a
	// full-bleed canvas surface when active for the selected workspace.
	canvasActive: boolean;
	selectedWorkspaceId: string | null;
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
	selectedWorkspaceId,
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
				<div className="relative flex h-full min-h-0 bg-background">
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

					{canvasActive && selectedWorkspaceId ? (
						<div className="relative min-w-0 flex-1">
							<Suspense
								fallback={
									<div className="flex size-full items-center justify-center bg-app-base text-app-muted-foreground text-sm">
										Loading canvas…
									</div>
								}
							>
								<CanvasSurface
									key={selectedWorkspaceId}
									workspaceId={selectedWorkspaceId}
									onSelectWorkspace={onSelectWorkspace}
								/>
							</Suspense>
						</div>
					) : (
						<>
							{activeScreen === "none" ? (
								<WorkspacePaneSurface {...workspacePane} />
							) : (
								<ScreenHost
									activeScreen={activeScreen}
									selectionActions={workspacePane.selectionActions}
									screenActions={sidebar.screenActions}
								/>
							)}

							{activeScreen === "none" &&
								rightSidebarAvailable &&
								selectedWorkspaceDetail?.mode !== "chat" && (
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
						</>
					)}
				</div>
			</main>
			<AppOverlays {...overlays} />
		</AppShellProviderStack>
	);
}
