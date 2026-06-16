// Drawing tool sub-toolbar, shown when the browser surface is in "draw" mode.
// Pure presentational component: tool select + color + stroke + undo/clear.
// All state lives upstream (the bridge's canvas state machine).
import {
	ArrowUpRight,
	Eraser,
	Pencil,
	Square,
	Type,
	Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DrawTool } from "./tools";

type ToolButton = {
	tool: DrawTool;
	label: string;
	icon: typeof Pencil;
	title?: string;
};

const TOOLS: ToolButton[] = [
	{ tool: "freehand", label: "Freehand", icon: Pencil },
	{ tool: "arrow", label: "Arrow", icon: ArrowUpRight },
	{ tool: "box", label: "Box", icon: Square },
	{ tool: "text", label: "Text", icon: Type },
	{
		tool: "redact",
		label: "Redact",
		icon: Eraser,
		title: "Redact — masks pixels permanently (cannot be undone)",
	},
];

/** Stroke colour swatches offered in the palette. */
export const DRAW_COLORS = [
	"#e53e3e",
	"#dd6b20",
	"#38a169",
	"#3182ce",
	"#805ad5",
	"#1a202c",
] as const;

/** Stroke width presets. */
export const DRAW_STROKES = [2, 4, 8] as const;

type Props = {
	activeTool: DrawTool;
	color: string;
	lineWidth: number;
	onSelectTool: (tool: DrawTool) => void;
	onSelectColor: (color: string) => void;
	onSelectStroke: (width: number) => void;
	onUndo: () => void;
	onClear: () => void;
};

export function DrawToolPalette({
	activeTool,
	color,
	lineWidth,
	onSelectTool,
	onSelectColor,
	onSelectStroke,
	onUndo,
	onClear,
}: Props) {
	return (
		<div
			role="toolbar"
			aria-label="Drawing tools"
			className="flex items-center gap-1 rounded-md border border-border bg-popover px-2 py-1"
		>
			{TOOLS.map(({ tool, label, icon: Icon, title }) => {
				const active = activeTool === tool;
				return (
					<Button
						key={tool}
						type="button"
						variant="ghost"
						size="icon-xs"
						title={title ?? label}
						aria-label={label}
						aria-pressed={active}
						onClick={() => onSelectTool(tool)}
						className={cn(
							"text-muted-foreground hover:text-foreground",
							active && "bg-accent/70 text-foreground",
						)}
					>
						<Icon className="size-3.5" strokeWidth={1.8} />
					</Button>
				);
			})}

			<div className="mx-0.5 h-4 w-px bg-border" />

			<div className="flex items-center gap-0.5" aria-label="Stroke color">
				{DRAW_COLORS.map((swatch) => (
					<button
						key={swatch}
						type="button"
						aria-label={`Color ${swatch}`}
						aria-pressed={color === swatch}
						onClick={() => onSelectColor(swatch)}
						className={cn(
							"size-4 cursor-pointer rounded-full border transition-transform hover:scale-110",
							color === swatch
								? "border-foreground ring-1 ring-foreground"
								: "border-border",
						)}
						style={{ backgroundColor: swatch }}
					/>
				))}
			</div>

			<div className="mx-0.5 h-4 w-px bg-border" />

			<div className="flex items-center gap-0.5" aria-label="Stroke width">
				{DRAW_STROKES.map((width) => (
					<button
						key={width}
						type="button"
						aria-label={`Stroke ${width}`}
						aria-pressed={lineWidth === width}
						onClick={() => onSelectStroke(width)}
						className={cn(
							"flex size-5 cursor-pointer items-center justify-center rounded transition-colors hover:bg-accent/70",
							lineWidth === width && "bg-accent/70",
						)}
					>
						<span
							className="rounded-full bg-foreground"
							style={{ width: width + 2, height: width + 2 }}
						/>
					</button>
				))}
			</div>

			<div className="mx-0.5 h-4 w-px bg-border" />

			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				title="Undo"
				aria-label="Undo"
				onClick={onUndo}
				className="text-muted-foreground hover:text-foreground"
			>
				<Undo2 className="size-3.5" strokeWidth={1.8} />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="xs"
				aria-label="Clear all"
				onClick={onClear}
				className="text-muted-foreground hover:text-foreground"
			>
				Clear
			</Button>
		</div>
	);
}
