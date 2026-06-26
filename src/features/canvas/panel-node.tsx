import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import {
	GitBranch,
	LayoutGrid,
	MessageSquare,
	NotebookPen,
	Pencil,
	SquarePen,
	SquareTerminal,
	X,
} from "lucide-react";
import { type ComponentType, useState } from "react";
import type { CanvasPanelType } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCanvasActions } from "./canvas-actions-context";
import { PanelConnections } from "./connections/panel-connections";
import { parsePanelConfig } from "./panel-config";
import { PanelErrorBoundary } from "./panel-error-boundary";
import { ConversationPanelBody } from "./panels/conversation-panel";
import { DrawingPanelBody } from "./panels/drawing-panel";
import { EditorPanelBody } from "./panels/editor-panel";
import { FileManagerPanelBody } from "./panels/file-manager-panel";
import { NotesPanelBody } from "./panels/notes-panel";
import { TerminalPanelBody } from "./panels/terminal-panel";
import {
	PANEL_DRAG_HANDLE_CLASS,
	PANEL_MIN_HEIGHT,
	PANEL_MIN_WIDTH,
	type PanelNode as PanelNodeType,
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
	"file-manager": { label: "Files", icon: LayoutGrid },
	editor: { label: "Editor", icon: SquarePen },
	git: { label: "Git", icon: GitBranch },
};

const HANDLE_CLASS =
	"!size-2.5 !border-2 !border-app-base !bg-[var(--xy-edge-stroke,#9ca3af)]";

export function PanelNode({ id, data, selected }: NodeProps<PanelNodeType>) {
	const { removeNode } = useCanvasActions();
	const meta = PANEL_META[data.panelType] ?? PANEL_META.placeholder;
	const Icon = meta.icon;
	const config = parsePanelConfig(data.config);
	const opacity = config.opacity;
	// Resize handles also show on hover — clicking a panel's (interactive) body
	// doesn't select the node, so selection alone would hide them and make
	// panels feel un-resizable.
	const [hovered, setHovered] = useState(false);

	return (
		<div
			className="flex size-full flex-col overflow-hidden rounded-[10px] border border-app-border bg-app-base text-app-foreground shadow-lg"
			style={{ opacity: opacity ?? "var(--canvas-panel-opacity, 1)" }}
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
					"flex h-9 shrink-0 cursor-grab items-center gap-2 border-app-border border-b bg-app-subtle px-2.5 active:cursor-grabbing",
				)}
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
			<div className="nodrag nowheel min-h-0 flex-1 overflow-hidden">
				<PanelErrorBoundary>
					<PanelBody
						nodeId={id}
						panelType={data.panelType}
						config={data.config}
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
}: {
	nodeId: string;
	panelType: CanvasPanelType;
	config: string;
}) {
	const config = parsePanelConfig(configRaw);

	switch (panelType) {
		case "conversation":
			return config.sessionId ? (
				<ConversationPanelBody sessionId={config.sessionId} />
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
		case "file-manager":
			return <FileManagerPanelBody nodeId={nodeId} />;
		case "editor":
			return <EditorPanelBody config={configRaw} />;
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
