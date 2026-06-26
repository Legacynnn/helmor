import {
	ArrowDownToLine,
	ArrowUpToLine,
	Copy,
	Droplets,
	Lock,
	Trash2,
	Unlock,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createShapeId, type Editor, type TLShapeId, useValue } from "tldraw";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { createSession } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCanvasWorkspace } from "../canvas-workspace-context";
import { parsePanelConfig, stringifyPanelConfig } from "../panel-config";
import type { PanelShape } from "../shapes/panel-shape";

/** Duplicate a panel safely: live-bound types (conversation/terminal) get a
 * fresh session/instance instead of cloning the binding; everything else
 * copies its config verbatim. */
async function duplicatePanel(
	editor: Editor,
	workspaceId: string,
	shape: PanelShape,
) {
	let config = shape.props.config;
	if (shape.props.panelType === "conversation") {
		const { sessionId } = await createSession(workspaceId);
		config = stringifyPanelConfig({
			...parsePanelConfig(shape.props.config),
			sessionId,
		});
	} else if (shape.props.panelType === "terminal") {
		config = stringifyPanelConfig({
			...parsePanelConfig(shape.props.config),
			instanceId: crypto.randomUUID(),
		});
	}
	const id = createShapeId();
	editor.createShape<PanelShape>({
		id,
		type: "panel",
		x: shape.x + 32,
		y: shape.y + 32,
		props: { ...shape.props, config },
	});
	editor.select(id);
}

/** Floating contextual toolbar shown when exactly one panel is selected. */
export function CanvasSelectionToolbar({ editor }: { editor: Editor }) {
	const { workspaceId } = useCanvasWorkspace();
	const selected = useValue<PanelShape | null>("canvas-selected-panel", () => {
		const ids = editor.getSelectedShapeIds();
		if (ids.length !== 1) return null;
		const shape = editor.getShape(ids[0]) as PanelShape | undefined;
		return shape?.type === "panel" ? shape : null;
	}, [editor]);

	if (!selected) return null;
	const id = selected.id as TLShapeId;
	const opacity = parsePanelConfig(selected.props.config).opacity ?? 1;

	const updateConfig = (patch: Record<string, unknown>) => {
		const next = { ...parsePanelConfig(selected.props.config), ...patch };
		editor.updateShape<PanelShape>({
			id,
			type: "panel",
			props: { config: stringifyPanelConfig(next) },
		});
	};

	return (
		<div className="-translate-x-1/2 pointer-events-auto absolute top-3 left-1/2 z-20 flex items-center gap-1 rounded-lg border border-app-border bg-app-base/95 px-1.5 py-1 shadow-lg backdrop-blur">
			<RenameField
				key={id}
				initial={selected.props.title}
				onCommit={(title) =>
					editor.updateShape<PanelShape>({
						id,
						type: "panel",
						props: { title },
					})
				}
			/>
			<Divider />
			<Popover>
				<PopoverTrigger asChild>
					<ToolbarButton label="Translucency">
						<Droplets className="size-3.5" />
					</ToolbarButton>
				</PopoverTrigger>
				<PopoverContent align="center" className="w-48 p-3">
					<div className="mb-2 flex items-center justify-between text-xs">
						<span>Translucency</span>
						<span className="text-app-muted-foreground">
							{Math.round(opacity * 100)}%
						</span>
					</div>
					<Slider
						min={20}
						max={100}
						step={5}
						value={[opacity * 100]}
						onValueChange={([v]) => updateConfig({ opacity: v / 100 })}
					/>
				</PopoverContent>
			</Popover>
			<ToolbarButton
				label="Bring to front"
				onClick={() => editor.bringToFront([id])}
			>
				<ArrowUpToLine className="size-3.5" />
			</ToolbarButton>
			<ToolbarButton
				label="Send to back"
				onClick={() => editor.sendToBack([id])}
			>
				<ArrowDownToLine className="size-3.5" />
			</ToolbarButton>
			<ToolbarButton
				label={selected.isLocked ? "Unlock" : "Lock"}
				onClick={() =>
					editor.updateShape({
						id,
						type: "panel",
						isLocked: !selected.isLocked,
					})
				}
			>
				{selected.isLocked ? (
					<Unlock className="size-3.5" />
				) : (
					<Lock className="size-3.5" />
				)}
			</ToolbarButton>
			<ToolbarButton
				label="Duplicate"
				onClick={() => {
					void duplicatePanel(editor, workspaceId, selected);
				}}
			>
				<Copy className="size-3.5" />
			</ToolbarButton>
			<Divider />
			<ToolbarButton
				label="Delete"
				onClick={() => editor.deleteShape(id)}
				danger
			>
				<Trash2 className="size-3.5" />
			</ToolbarButton>
		</div>
	);
}

function RenameField({
	initial,
	onCommit,
}: {
	initial: string;
	onCommit: (title: string) => void;
}) {
	const [value, setValue] = useState(initial);
	useEffect(() => setValue(initial), [initial]);
	return (
		<input
			className="h-6 w-32 rounded bg-transparent px-1.5 text-xs outline-none focus:bg-app-muted"
			value={value}
			placeholder="Untitled"
			onChange={(e) => setValue(e.target.value)}
			onBlur={() => onCommit(value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") e.currentTarget.blur();
			}}
		/>
	);
}

function ToolbarButton({
	label,
	onClick,
	danger,
	children,
}: {
	label: string;
	onClick?: () => void;
	danger?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className={cn(
				"flex size-6 cursor-pointer items-center justify-center rounded text-app-muted-foreground hover:bg-app-muted hover:text-app-foreground",
				danger && "hover:bg-destructive/15 hover:text-destructive",
			)}
		>
			{children}
		</button>
	);
}

function Divider() {
	return <div className="mx-0.5 h-4 w-px bg-app-border" />;
}
