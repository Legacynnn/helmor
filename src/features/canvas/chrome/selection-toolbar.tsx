import { useOnSelectionChange } from "@xyflow/react";
import {
	ArrowDownToLine,
	ArrowUpToLine,
	Copy,
	Droplets,
	Lock,
	Trash2,
	Unlock,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useCanvasActions } from "../canvas-actions-context";
import { parsePanelConfig } from "../panel-config";
import type { PanelNode } from "../types";

/** Floating contextual toolbar shown when exactly one panel is selected. */
export function CanvasSelectionToolbar() {
	const actions = useCanvasActions();
	const [selected, setSelected] = useState<PanelNode | null>(null);

	const onChange = useCallback(({ nodes }: { nodes: PanelNode[] }) => {
		setSelected(nodes.length === 1 ? nodes[0] : null);
	}, []);
	useOnSelectionChange({ onChange });

	if (!selected) return null;
	const id = selected.id;
	const opacity = parsePanelConfig(selected.data.config).opacity ?? 1;

	const setOpacity = (v: number) => {
		const next = { ...parsePanelConfig(selected.data.config), opacity: v };
		actions.patchNodeData(id, { config: JSON.stringify(next) });
		setSelected((s) =>
			s && s.id === id
				? { ...s, data: { ...s.data, config: JSON.stringify(next) } }
				: s,
		);
	};

	return (
		<div className="-translate-x-1/2 pointer-events-auto absolute top-3 left-1/2 z-20 flex items-center gap-1 rounded-lg border border-app-border bg-app-base/95 px-1.5 py-1 shadow-lg backdrop-blur">
			<RenameField
				key={id}
				initial={selected.data.title}
				onCommit={(title) => actions.patchNodeData(id, { title })}
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
						onValueChange={([v]) => setOpacity(v / 100)}
					/>
				</PopoverContent>
			</Popover>
			<ToolbarButton
				label="Bring to front"
				onClick={() => actions.bringToFront(id)}
			>
				<ArrowUpToLine className="size-3.5" />
			</ToolbarButton>
			<ToolbarButton
				label="Send to back"
				onClick={() => actions.sendToBack(id)}
			>
				<ArrowDownToLine className="size-3.5" />
			</ToolbarButton>
			<ToolbarButton
				label={selected.data.locked ? "Unlock" : "Lock"}
				onClick={() => actions.setLocked(id, !selected.data.locked)}
			>
				{selected.data.locked ? (
					<Unlock className="size-3.5" />
				) : (
					<Lock className="size-3.5" />
				)}
			</ToolbarButton>
			<ToolbarButton
				label="Duplicate"
				onClick={() => {
					void actions.duplicateNode(id);
				}}
			>
				<Copy className="size-3.5" />
			</ToolbarButton>
			<Divider />
			<ToolbarButton
				label="Delete"
				onClick={() => actions.removeNode(id)}
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
