import { useNodes, useReactFlow } from "@xyflow/react";
import {
	Circle,
	FolderTree,
	GitBranch,
	Grid3x3,
	LayoutGrid,
	MessageSquare,
	NotebookPen,
	PanelLeftClose,
	PanelLeftOpen,
	Pencil,
	Square,
	SquarePen,
	SquareTerminal,
} from "lucide-react";
import { type ComponentType, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type {
	CanvasBackgroundPattern,
	CanvasBackgroundTheme,
	CanvasPanelType,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCanvasViewStore } from "../canvas-view-store";
import { useConnectionsStore } from "../connections/connections-store";
import type { PanelNode } from "../types";

const PANEL_ICONS: Record<
	CanvasPanelType,
	ComponentType<{ className?: string }>
> = {
	placeholder: LayoutGrid,
	conversation: MessageSquare,
	terminal: SquareTerminal,
	notes: NotebookPen,
	drawing: Pencil,
	"file-manager": FolderTree,
	editor: SquarePen,
	git: GitBranch,
};

const PATTERNS: {
	value: CanvasBackgroundPattern;
	icon: ComponentType<{ className?: string }>;
	label: string;
}[] = [
	{ value: "blank", icon: Square, label: "Blank" },
	{ value: "dots", icon: Circle, label: "Dots" },
	{ value: "lines", icon: Grid3x3, label: "Lines" },
];

const THEMES: CanvasBackgroundTheme[] = ["system", "light", "dark"];

/** Left "Manage" rail: panel list with jump-to, the global translucency
 * slider, background controls, and a snap-to-grid toggle. Collapses away. */
export function CanvasManageRail() {
	const [collapsed, setCollapsed] = useState(false);
	const rf = useReactFlow<PanelNode>();
	const nodes = useNodes<PanelNode>();
	const translucency = useCanvasViewStore((s) => s.translucency);
	const pattern = useCanvasViewStore((s) => s.backgroundPattern);
	const theme = useCanvasViewStore((s) => s.backgroundTheme);
	const snapToGrid = useCanvasViewStore((s) => s.snapToGrid);
	const setAppearance = useCanvasViewStore((s) => s.setAppearance);
	const connectionCount = useConnectionsStore((s) => s.connections.length);

	const panels = [...nodes].sort((a, b) => a.position.y - b.position.y);

	const jumpTo = (id: string) => {
		void rf.fitView({ nodes: [{ id }], duration: 200, maxZoom: 1.2 });
	};

	if (collapsed) {
		return (
			<button
				type="button"
				aria-label="Open manage panel"
				className="pointer-events-auto absolute top-16 left-3 z-10 flex size-7 cursor-pointer items-center justify-center rounded-lg border border-app-border bg-app-base/90 text-app-muted-foreground shadow-lg backdrop-blur hover:text-app-foreground"
				onClick={() => setCollapsed(false)}
			>
				<PanelLeftOpen className="size-4" />
			</button>
		);
	}

	return (
		<div className="pointer-events-auto absolute top-16 bottom-16 left-3 z-10 flex w-60 flex-col rounded-lg border border-app-border bg-app-base/90 shadow-lg backdrop-blur">
			<div className="flex items-center justify-between border-app-border border-b px-3 py-2">
				<span className="font-medium text-app-muted-foreground text-[10px] uppercase tracking-wide">
					Manage
				</span>
				<button
					type="button"
					aria-label="Collapse manage panel"
					className="flex size-5 cursor-pointer items-center justify-center rounded text-app-muted-foreground hover:bg-app-muted hover:text-app-foreground"
					onClick={() => setCollapsed(true)}
				>
					<PanelLeftClose className="size-3.5" />
				</button>
			</div>

			<div className="flex flex-col gap-3 overflow-y-auto p-3 text-xs">
				<section>
					<Label>Translucency · {Math.round(translucency * 100)}%</Label>
					<Slider
						min={20}
						max={100}
						step={5}
						value={[translucency * 100]}
						onValueChange={([v]) => setAppearance({ translucency: v / 100 })}
					/>
				</section>

				<section>
					<Label>Background</Label>
					<div className="flex gap-1">
						{PATTERNS.map((p) => {
							const Icon = p.icon;
							return (
								<button
									key={p.value}
									type="button"
									title={p.label}
									onClick={() => setAppearance({ backgroundPattern: p.value })}
									className={cn(
										"flex flex-1 cursor-pointer items-center justify-center gap-1 rounded border border-app-border py-1.5 hover:bg-app-muted",
										pattern === p.value && "bg-app-muted text-app-foreground",
									)}
								>
									<Icon className="size-3.5" />
								</button>
							);
						})}
					</div>
					<div className="mt-1.5 flex gap-1">
						{THEMES.map((t) => (
							<button
								key={t}
								type="button"
								onClick={() => setAppearance({ backgroundTheme: t })}
								className={cn(
									"flex-1 cursor-pointer rounded border border-app-border py-1 text-[10px] capitalize hover:bg-app-muted",
									theme === t && "bg-app-muted text-app-foreground",
								)}
							>
								{t}
							</button>
						))}
					</div>
				</section>

				<section className="flex items-center justify-between">
					<Label className="mb-0">Snap to grid</Label>
					<Switch
						checked={snapToGrid}
						onCheckedChange={(v) => setAppearance({ snapToGrid: v })}
					/>
				</section>

				<section>
					<Label>
						Panels · {panels.length}
						{connectionCount > 0 ? ` · ${connectionCount} links` : ""}
					</Label>
					<div className="flex flex-col gap-0.5">
						{panels.length === 0 ? (
							<div className="py-1 text-app-muted-foreground">
								No panels yet.
							</div>
						) : (
							panels.map((p) => {
								const Icon = PANEL_ICONS[p.data.panelType] ?? LayoutGrid;
								return (
									<button
										key={p.id}
										type="button"
										onClick={() => jumpTo(p.id)}
										className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-app-muted"
									>
										<Icon className="size-3.5 shrink-0 opacity-60" />
										<span className="min-w-0 flex-1 truncate">
											{p.data.title || p.data.panelType}
										</span>
									</button>
								);
							})
						)}
					</div>
				</section>
			</div>
		</div>
	);
}

function Label({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"mb-1.5 font-medium text-app-muted-foreground text-[10px] uppercase tracking-wide",
				className,
			)}
		>
			{children}
		</div>
	);
}
