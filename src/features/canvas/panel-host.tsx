import {
	LayoutGrid,
	MessageSquare,
	NotebookPen,
	Pencil,
	SquareTerminal,
	X,
} from "lucide-react";
import type { ComponentType } from "react";
import { stopEventPropagation, useEditor } from "tldraw";
import type { CanvasPanelType } from "@/lib/api";
import { cn } from "@/lib/utils";
import { parsePanelConfig } from "./panel-config";
import { ConversationPanelBody } from "./panels/conversation-panel";
import { TerminalPanelBody } from "./panels/terminal-panel";
import type { PanelShape } from "./shapes/panel-shape";

type PanelMeta = {
	label: string;
	icon: ComponentType<{ className?: string }>;
};

/** Per-type chrome metadata. Bodies are wired in their respective phases;
 * Phase 1 renders the placeholder body for every type. */
const PANEL_META: Record<CanvasPanelType, PanelMeta> = {
	placeholder: { label: "Panel", icon: LayoutGrid },
	conversation: { label: "Conversation", icon: MessageSquare },
	terminal: { label: "Terminal", icon: SquareTerminal },
	notes: { label: "Notes", icon: NotebookPen },
	drawing: { label: "Drawing", icon: Pencil },
	"file-manager": { label: "Files", icon: LayoutGrid },
	editor: { label: "Editor", icon: Pencil },
};

/** Renders one canvas panel: a draggable header (events bubble to tldraw so the
 * panel moves) over an interactive body (events stopped so inner UI works and
 * the canvas neither pans nor drags the shape). */
export function PanelHost({ shape }: { shape: PanelShape }) {
	const editor = useEditor();
	const meta = PANEL_META[shape.props.panelType] ?? PANEL_META.placeholder;
	const Icon = meta.icon;

	return (
		<div className="flex size-full flex-col overflow-hidden rounded-[10px] border border-app-border bg-app-base text-app-foreground shadow-lg">
			{/* Header is the drag handle — do NOT stop propagation here. */}
			<div className="flex h-9 shrink-0 items-center gap-2 border-app-border border-b bg-app-subtle px-2.5">
				<Icon className="size-3.5 shrink-0 opacity-70" />
				<span className="min-w-0 flex-1 truncate font-medium text-xs">
					{shape.props.title || meta.label}
				</span>
				<span className="shrink-0 rounded bg-app-muted px-1.5 py-0.5 text-[10px] text-app-muted-foreground uppercase tracking-wide">
					{meta.label}
				</span>
				<button
					type="button"
					aria-label="Close panel"
					className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-app-muted-foreground hover:bg-app-muted hover:text-app-foreground"
					onPointerDown={stopEventPropagation}
					onClick={(e) => {
						stopEventPropagation(e);
						editor.deleteShape(shape.id);
					}}
				>
					<X className="size-3.5" />
				</button>
			</div>
			{/* Body is interactive — stop propagation so inner UI receives events. */}
			<div
				className="min-h-0 flex-1 overflow-hidden"
				onPointerDown={stopEventPropagation}
				onWheelCapture={stopEventPropagation}
			>
				<PanelBody shape={shape} />
			</div>
		</div>
	);
}

function PanelBody({ shape }: { shape: PanelShape }) {
	const config = parsePanelConfig(shape.props.config);

	if (shape.props.panelType === "conversation") {
		return config.sessionId ? (
			<ConversationPanelBody sessionId={config.sessionId} />
		) : (
			<PlaceholderBody type="conversation" note="No session bound." />
		);
	}
	if (shape.props.panelType === "terminal") {
		return config.instanceId ? (
			<TerminalPanelBody instanceId={config.instanceId} />
		) : (
			<PlaceholderBody type="terminal" note="No terminal bound." />
		);
	}
	// Notes / drawing / file-manager / editor land in Phase 4.
	return <PlaceholderBody type={shape.props.panelType} />;
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
		<div
			className={cn(
				"flex size-full flex-col items-center justify-center gap-2 p-4 text-center",
				"text-app-muted-foreground",
			)}
		>
			<Icon className="size-8 opacity-40" />
			<div className="font-medium text-sm">{meta.label} panel</div>
			<div className="text-xs opacity-70">{note}</div>
		</div>
	);
}
