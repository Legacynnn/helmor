import { LayoutGrid, MessageSquare, Plus, SquareTerminal } from "lucide-react";
import type { ComponentType } from "react";
import { createShapeId, type Editor } from "tldraw";
import { type CanvasPanelType, createSession } from "@/lib/api";
import { stringifyPanelConfig } from "./panel-config";
import {
	PANEL_DEFAULT_HEIGHT,
	PANEL_DEFAULT_WIDTH,
	type PanelShape,
} from "./shapes/panel-shape";

type PaletteEntry = {
	type: CanvasPanelType;
	label: string;
	icon: ComponentType<{ className?: string }>;
};

// Phase 2 ships the placeholder + the two live core panel kinds. The full
// palette (notes/drawing/editor/…) lands with the right rail in Phase 5.
const PALETTE: PaletteEntry[] = [
	{ type: "conversation", label: "Conversation", icon: MessageSquare },
	{ type: "terminal", label: "Terminal", icon: SquareTerminal },
	{ type: "placeholder", label: "Panel", icon: LayoutGrid },
];

/** Create a panel of `type` centered in the current viewport and select it.
 * Conversation panels first create a bound Helmor session; terminal panels
 * get a fresh PTY instance id. The id is persisted in the panel's config so it
 * rebinds on reload. */
export async function createPanel(
	editor: Editor,
	workspaceId: string,
	type: CanvasPanelType,
) {
	let config = "{}";
	if (type === "conversation") {
		const { sessionId } = await createSession(workspaceId);
		config = stringifyPanelConfig({ sessionId });
	} else if (type === "terminal") {
		config = stringifyPanelConfig({ instanceId: crypto.randomUUID() });
	}

	const center = editor.getViewportPageBounds().center;
	const id = createShapeId();
	editor.createShape<PanelShape>({
		id,
		type: "panel",
		x: center.x - PANEL_DEFAULT_WIDTH / 2,
		y: center.y - PANEL_DEFAULT_HEIGHT / 2,
		props: {
			w: PANEL_DEFAULT_WIDTH,
			h: PANEL_DEFAULT_HEIGHT,
			panelType: type,
			title: "",
			config,
			locked: false,
		},
	});
	editor.select(id);
}

/** Floating create-panel control. Seed of the Phase 5 right "Create" rail. */
export function CanvasCreateToolbar({
	editor,
	workspaceId,
}: {
	editor: Editor | null;
	workspaceId: string;
}) {
	if (!editor) return null;
	return (
		<div className="pointer-events-auto absolute top-3 right-3 z-10 flex flex-col gap-1 rounded-lg border border-app-border bg-app-base/90 p-1 shadow-lg backdrop-blur">
			<div className="flex items-center gap-1.5 px-1.5 pt-0.5 pb-1 text-[10px] text-app-muted-foreground uppercase tracking-wide">
				<Plus className="size-3" /> Create
			</div>
			{PALETTE.map((entry) => {
				const Icon = entry.icon;
				return (
					<button
						key={entry.type}
						type="button"
						className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-app-muted"
						onClick={() => {
							void createPanel(editor, workspaceId, entry.type);
						}}
					>
						<Icon className="size-3.5 shrink-0 opacity-70" />
						<span>{entry.label}</span>
					</button>
				);
			})}
		</div>
	);
}
