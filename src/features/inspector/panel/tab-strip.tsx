import { FilesIcon, GitBranchIcon, SearchIcon, ZapIcon } from "lucide-react";
import type { ComponentType } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { getShortcut } from "@/features/shortcuts/registry";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import type { ShortcutId } from "@/features/shortcuts/types";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import type { PanelTabId } from "./state";

type PanelTabDescriptor = {
	id: PanelTabId;
	label: string;
	icon: ComponentType<{ className?: string; strokeWidth?: number }>;
	shortcutId: ShortcutId;
};

export const PANEL_TABS: readonly PanelTabDescriptor[] = [
	{
		id: "files",
		label: "Files",
		icon: FilesIcon,
		shortcutId: "panel.showFiles",
	},
	{ id: "git", label: "Git", icon: GitBranchIcon, shortcutId: "panel.showGit" },
	{
		id: "search",
		label: "Search",
		icon: SearchIcon,
		shortcutId: "panel.showSearch",
	},
	{
		id: "actions",
		label: "Actions",
		icon: ZapIcon,
		shortcutId: "panel.showActions",
	},
];

type PanelTabStripProps = {
	activeTab: PanelTabId;
	onTabChange: (tab: PanelTabId) => void;
};

/**
 * Icon strip in the panel section header — VS Code activity-bar style.
 * Each icon carries a tooltip with the page name and its keybind.
 */
export function PanelTabStrip({ activeTab, onTabChange }: PanelTabStripProps) {
	const { settings } = useSettings();
	return (
		<div
			role="tablist"
			aria-orientation="horizontal"
			aria-label="Inspector panel tabs"
			className="flex h-full min-w-0 items-stretch gap-0"
		>
			{PANEL_TABS.map(({ id, label, icon: Icon, shortcutId }) => {
				const isActive = activeTab === id;
				const hotkey = getShortcut(settings.shortcuts, shortcutId);
				return (
					<Tooltip key={id}>
						<TooltipTrigger asChild>
							<button
								type="button"
								role="tab"
								id={`inspector-panel-tab-${id}`}
								aria-controls={`inspector-panel-page-${id}`}
								aria-selected={isActive}
								aria-label={label}
								tabIndex={isActive ? 0 : -1}
								onClick={() => onTabChange(id)}
								className={cn(
									"relative inline-flex h-full cursor-pointer items-center justify-center px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-0",
									isActive && "text-foreground",
								)}
							>
								<Icon className="size-3.5" strokeWidth={1.8} />
								<span
									aria-hidden="true"
									className={cn(
										"pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-foreground opacity-0 transition-opacity",
										isActive && "opacity-100",
									)}
								/>
							</button>
						</TooltipTrigger>
						<TooltipContent
							side="bottom"
							className="flex h-[24px] items-center gap-2 rounded-md px-2 text-small leading-none"
						>
							<span>{label}</span>
							{hotkey ? (
								<InlineShortcutDisplay
									hotkey={hotkey}
									className="text-background/60"
								/>
							) : null}
						</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}
