import { useReactFlow } from "@xyflow/react";
import { Check } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { focusPanel } from "../bindings/focus-panel";
import {
	BINDING_DIGITS,
	buildPanelRows,
	customBindingConflicts,
	formatBinding,
} from "../bindings/panel-bindings";
import { usePanelsListStore } from "../bindings/panels-list-store";
import { useCanvasActions } from "../canvas-actions-context";
import { parsePanelConfig, stringifyPanelConfig } from "../panel-config";
import { PANEL_META } from "../panel-node";
import type { PanelNode } from "../types";

/** Glass "Panels" popover (⌘/ or the workspace-controls button): lists every
 * panel with its effective ⌘+digit binding. Clicking a row focuses that panel;
 * the digit badge opens a picker to pin a custom binding (or revert to Auto).
 * Open-state is shared via `usePanelsListStore`, anchored under the top-left
 * controls. */
export function PanelsListPopover({ nodes }: { nodes: PanelNode[] }) {
	const open = usePanelsListStore((s) => s.open);
	const setOpen = usePanelsListStore((s) => s.setOpen);
	const rf = useReactFlow();
	const actions = useCanvasActions();

	const bindingInputs = nodes.map((n) => ({
		id: n.id,
		binding: parsePanelConfig(n.data.config).binding,
	}));

	const rows = buildPanelRows(
		nodes.map((n) => ({
			id: n.id,
			title: n.data.title,
			typeLabel: (PANEL_META[n.data.panelType] ?? PANEL_META.placeholder).label,
			binding: parsePanelConfig(n.data.config).binding,
		})),
	);

	const setBinding = (id: string, digit: number | null) => {
		const node = nodes.find((n) => n.id === id);
		if (!node) return;
		const next = { ...parsePanelConfig(node.data.config) };
		if (digit === null) delete next.binding;
		else next.binding = digit;
		actions.patchNodeData(id, { config: stringifyPanelConfig(next) });
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<span className="pointer-events-none absolute top-14 left-3 block h-0 w-0" />
			</PopoverTrigger>
			<PopoverContent side="bottom" align="start" className="w-72 p-1.5">
				<div className="mb-1 px-1.5 pt-1 font-medium text-[10px] text-app-muted-foreground uppercase tracking-wide">
					Panels
				</div>
				{rows.length === 0 ? (
					<div className="px-2 py-3 text-center text-app-muted-foreground text-xs">
						No panels yet.
					</div>
				) : (
					rows.map((row) => (
						<div
							key={row.id}
							className="flex items-center gap-1 rounded-md px-0.5 hover:bg-app-muted"
						>
							<button
								type="button"
								className="flex min-w-0 flex-1 cursor-pointer items-center rounded px-1.5 py-1.5 text-left text-xs"
								onClick={() => {
									focusPanel(rf, row.id);
									setOpen(false);
								}}
							>
								<span className="min-w-0 flex-1 truncate">{row.label}</span>
							</button>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										title="Change shortcut"
										className="shrink-0 cursor-pointer rounded border border-app-border px-1.5 py-0.5 font-mono text-[11px] text-app-muted-foreground hover:bg-app-muted hover:text-app-foreground"
									>
										{row.effective ? formatBinding(row.effective) : "—"}
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="min-w-28">
									<DropdownMenuItem onClick={() => setBinding(row.id, null)}>
										<span className="flex-1">Auto</span>
										{row.custom === null ? (
											<Check className="size-3.5" />
										) : null}
									</DropdownMenuItem>
									{BINDING_DIGITS.map((digit) => (
										<DropdownMenuItem
											key={digit}
											disabled={customBindingConflicts(
												bindingInputs,
												row.id,
												digit,
											)}
											onClick={() => setBinding(row.id, digit)}
										>
											<span className="flex-1">{formatBinding(digit)}</span>
											{row.custom === digit ? (
												<Check className="size-3.5" />
											) : null}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					))
				)}
			</PopoverContent>
		</Popover>
	);
}
