import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import {
	FolderTree,
	GitBranch,
	LayoutGrid,
	MessageSquare,
	NotebookPen,
	Pencil,
	SquareTerminal,
	X,
} from "lucide-react";
import { type ComponentType, useState } from "react";
import type { CanvasPanelType } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCanvasActions } from "./canvas-actions-context";
import { useCanvasInteractionStore } from "./canvas-interaction-store";
import { useCanvasViewStore } from "./canvas-view-store";
import { PanelConnections } from "./connections/panel-connections";
import { parsePanelConfig } from "./panel-config";
import { PanelErrorBoundary } from "./panel-error-boundary";
import { ConversationPanelBody } from "./panels/conversation-panel";
import { DrawingPanelBody } from "./panels/drawing-panel";
import { EditorPanelBody } from "./panels/editor-panel";
import { GitPanelBody } from "./panels/git-panel-body";
import { NotesPanelBody } from "./panels/notes-panel";
import { TerminalPanelBody } from "./panels/terminal-panel";
import {
	PANEL_DRAG_HANDLE_CLASS,
	PANEL_MIN_HEIGHT,
	PANEL_MIN_WIDTH,
	type PanelNode as PanelNodeType,
	READABLE_PANEL_MIN_ALPHA,
} from "./types";

const PANEL_META: Record<
	CanvasPanelType,
	{ label: string; icon: ComponentType<{ className?: string }> }
> = {
	placeholder: { label: "Panel", icon: LayoutGrid },
	conversation: { label: "Conversation", icon: MessageSquare },
	terminal: { label: "Terminal", icon: SquareTerminal },
	notes: { label: "Notes", icon: NotebookPen },
	drawing: { label: "Drawing", icon: Pencil },
	"file-manager": { label: "Editor", icon: FolderTree },
	editor: { label: "Editor", icon: FolderTree },
	git: { label: "Git", icon: GitBranch },
};

const HANDLE_CLASS =
	"!size-2.5 !border-2 !border-app-base !bg-[var(--xy-edge-stroke,#9ca3af)]";

/** Build a surface fill at the given alpha. Translucency fades the panel's
 * *surfaces* only — never its content/text — by mixing the (opaque) theme token
 * toward transparent. At full strength we return the bare token so opaque panels
 * pay no `color-mix` cost.
 *
 * The token carries a defined fallback (`--bg-elevated`) so the surface never
 * collapses to `transparent` if `--canvas-pane-*` isn't resolved yet (e.g. the
 * webview hasn't hot-loaded the newly-added custom properties) — an undefined
 * `var()` inside `color-mix` would otherwise void the whole declaration. */
const PANE_FALLBACK = "var(--bg-elevated)";
function surface(token: string, alpha: number): string {
	const color = `var(${token}, ${PANE_FALLBACK})`;
	if (alpha >= 1) return color;
	return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function PanelNode({ id, data, selected }: NodeProps<PanelNodeType>) {
	const { removeNode } = useCanvasActions();
	const meta = PANEL_META[data.panelType] ?? PANEL_META.placeholder;
	const Icon = meta.icon;
	const config = parsePanelConfig(data.config);
	// Effective translucency for this panel: the per-panel override wins, else
	// the canvas-wide slider. 1 = fully opaque, 0 = fully see-through.
	const canvasTranslucency = useCanvasViewStore((s) => s.translucency);
	// Conversation and terminal panels are text-heavy: they paint their OWN
	// translucent surface inside (conversation-panel/terminal-panel) and get a
	// gentler readability floor.
	const ownsSurface =
		data.panelType === "conversation" || data.panelType === "terminal";
	const minAlpha = ownsSurface ? READABLE_PANEL_MIN_ALPHA : 0;
	const alpha = clamp01(
		Math.max(config.opacity ?? canvasTranslucency, minAlpha),
	);
	const translucent = alpha < 1;
	// Translucency targets surfaces, not content. The body fill honours the
	// slider fully; the header keeps a legibility floor so the title, controls
	// and drag handle never dissolve into a busy background. A backdrop blur
	// frosts whatever shows through, and the opaque border + shadow keep the
	// panel's edges defined over any canvas background.
	//
	// Own-surface panels (conversation, terminal) are the exception: their body
	// renders a single translucent surface itself, so the thread/terminal and
	// the surrounding chrome match exactly and stay readable. We keep this outer
	// container transparent (and skip the backdrop blur) for them — a second
	// opaque-ish layer would cancel the translucency, and a backdrop-filter
	// wrapping scrolling content makes WebKit drop the content entirely.
	const bodyAlpha = ownsSurface ? 0 : alpha;
	const headerAlpha = Math.max(alpha, 0.55);
	const blur = translucent && !ownsSurface ? "blur(16px)" : undefined;
	// In select mode the body becomes a drag surface (whole-panel move); in
	// interact mode it stays `nodrag` so chats/terminals receive their own input.
	const selectMode = useCanvasInteractionStore((s) => s.selectMode);
	// Resize handles also show on hover — clicking a panel's (interactive) body
	// doesn't select the node, so selection alone would hide them and make
	// panels feel un-resizable.
	const [hovered, setHovered] = useState(false);

	return (
		<div
			className="flex size-full flex-col overflow-hidden rounded-[10px] border border-app-border text-app-foreground shadow-lg"
			style={{
				backgroundColor: surface("--canvas-pane-bg", bodyAlpha),
				backdropFilter: blur,
				WebkitBackdropFilter: blur,
			}}
			onPointerEnter={() => setHovered(true)}
			onPointerLeave={() => setHovered(false)}
		>
			<NodeResizer
				isVisible={(selected || hovered) && !data.locked}
				minWidth={PANEL_MIN_WIDTH}
				minHeight={PANEL_MIN_HEIGHT}
				lineClassName="!border-[var(--color-selected,#3b82f6)]"
				handleClassName="!size-2 !rounded-[2px] !border-[var(--color-selected,#3b82f6)] !bg-app-base"
			/>
			{/* Edge endpoints — drag from the right (source) to another panel's
			 *  left (target). Each panel is both, so chains compose. */}
			<Handle
				type="target"
				position={Position.Left}
				className={HANDLE_CLASS}
				isConnectable={!data.locked}
			/>
			<Handle
				type="source"
				position={Position.Right}
				className={HANDLE_CLASS}
				isConnectable={!data.locked}
			/>

			{/* Header is the drag handle. */}
			<div
				className={cn(
					PANEL_DRAG_HANDLE_CLASS,
					"flex h-9 shrink-0 cursor-grab items-center gap-2 border-app-border border-b px-2.5 active:cursor-grabbing",
				)}
				style={{
					backgroundColor: surface("--canvas-pane-header-bg", headerAlpha),
				}}
			>
				<Icon className="size-3.5 shrink-0 opacity-70" />
				<span className="min-w-0 flex-1 truncate font-medium text-xs">
					{data.title || meta.label}
				</span>
				<PanelConnections nodeId={id} panelType={data.panelType} />
				<button
					type="button"
					aria-label="Close panel"
					className="nodrag flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-app-muted-foreground hover:bg-app-muted hover:text-app-foreground"
					onClick={() => removeNode(id)}
				>
					<X className="size-3.5" />
				</button>
			</div>

			{/* Body is interactive — nodrag/nowheel so React Flow doesn't pan,
			 *  drag, or zoom while the user works inside it. */}
			<div
				className={cn(
					"nowheel min-h-0 flex-1 overflow-hidden",
					!selectMode && "nodrag",
				)}
			>
				<PanelErrorBoundary>
					<PanelBody
						nodeId={id}
						panelType={data.panelType}
						config={data.config}
						nodeTitle={data.title}
					/>
				</PanelErrorBoundary>
			</div>
		</div>
	);
}

function PanelBody({
	nodeId,
	panelType,
	config: configRaw,
	nodeTitle,
}: {
	nodeId: string;
	panelType: CanvasPanelType;
	config: string;
	nodeTitle?: string;
}) {
	const config = parsePanelConfig(configRaw);

	switch (panelType) {
		case "conversation":
			return config.sessionId ? (
				<ConversationPanelBody
					nodeId={nodeId}
					sessionId={config.sessionId}
					nodeTitle={nodeTitle}
				/>
			) : (
				<PlaceholderBody type="conversation" note="No session bound." />
			);
		case "terminal":
			return config.instanceId ? (
				<TerminalPanelBody instanceId={config.instanceId} />
			) : (
				<PlaceholderBody type="terminal" note="No terminal bound." />
			);
		case "notes":
			return <NotesPanelBody nodeId={nodeId} config={configRaw} />;
		case "drawing":
			return <DrawingPanelBody nodeId={nodeId} config={configRaw} />;
		// Files + editor are one panel now (tree on the right, content on the
		// left). `file-manager` stays mapped for any legacy panels created before
		// the merge — they reopen as the combined editor.
		case "file-manager":
		case "editor":
			return <EditorPanelBody nodeId={nodeId} config={configRaw} />;
		case "git":
			return <GitPanelBody />;
		default:
			return <PlaceholderBody type={panelType} />;
	}
}

function PlaceholderBody({
	type,
	note = "Live content arrives in a later phase.",
}: {
	type: CanvasPanelType;
	note?: string;
}) {
	const meta = PANEL_META[type] ?? PANEL_META.placeholder;
	const Icon = meta.icon;
	return (
		<div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-app-muted-foreground">
			<Icon className="size-8 opacity-40" />
			<div className="font-medium text-sm">{meta.label} panel</div>
			<div className="text-xs opacity-70">{note}</div>
		</div>
	);
}
