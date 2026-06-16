// Tab strip for the browser surface, mirroring `EditorFileTabs`. Each tab shows
// a title, active styling, and a hover-revealed close button; a trailing button
// opens a new tab. Purely presentational — selection/close/new are props.
import { Plus, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { BrowserTab } from "../tab-model";

type BrowserTabsProps = {
	tabs: BrowserTab[];
	activeTabId: string | null;
	onSelectTab: (id: string) => void;
	onCloseTab: (id: string) => void;
	onNewTab: () => void;
};

export function BrowserTabs({
	tabs,
	activeTabId,
	onSelectTab,
	onCloseTab,
	onNewTab,
}: BrowserTabsProps) {
	return (
		<div
			data-tauri-drag-region
			className="flex h-full min-w-0 flex-1 items-stretch overflow-hidden"
		>
			<div className="scrollbar-none h-full min-w-0 overflow-x-auto">
				<Tabs
					value={activeTabId ?? ""}
					onValueChange={(value) => {
						if (value) onSelectTab(value);
					}}
					className="h-full min-w-max gap-0"
				>
					<TabsList
						aria-label="Open tabs"
						className="inline-flex h-full w-max justify-start self-start bg-transparent p-0"
					>
						{tabs.map((tab) => {
							const active = tab.id === activeTabId;
							return (
								<TabsTrigger
									key={tab.id}
									value={tab.id}
									className={cn(
										"group/tab relative h-full w-auto min-w-[7rem] max-w-[14rem] shrink-0 flex-none justify-start gap-1.5 overflow-hidden rounded-none border-0 bg-transparent px-3 text-ui text-muted-foreground shadow-none data-active:bg-background data-active:text-foreground data-active:shadow-none aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-none dark:data-active:border-transparent dark:data-active:bg-background dark:aria-selected:border-transparent dark:aria-selected:bg-background",
										active ? "font-medium" : undefined,
									)}
								>
									<span className="tab-content-fade flex min-w-0 flex-1 items-center gap-1.5">
										<span className="truncate">{tab.title || tab.url}</span>
										{tab.loading ? (
											<span
												aria-label="Loading"
												className="size-1.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/55"
											/>
										) : null}
									</span>
									<span className="pointer-events-none invisible absolute inset-y-0 right-0 flex items-center pr-1 group-hover/tab:pointer-events-auto group-hover/tab:visible">
										<span
											role="button"
											aria-label={`Close ${tab.title || tab.url}`}
											onPointerDown={(event) => {
												event.preventDefault();
												event.stopPropagation();
											}}
											onClick={(event) => {
												event.preventDefault();
												event.stopPropagation();
												onCloseTab(tab.id);
											}}
											className="flex cursor-pointer items-center justify-center rounded-sm p-0.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
										>
											<X className="size-3" strokeWidth={2} />
										</span>
									</span>
								</TabsTrigger>
							);
						})}
					</TabsList>
				</Tabs>
			</div>
			<button
				type="button"
				aria-label="New tab"
				onClick={onNewTab}
				className="ml-1 flex h-full w-6 shrink-0 cursor-pointer items-center justify-center self-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-0"
			>
				<Plus className="size-3.5" strokeWidth={1.8} />
			</button>
		</div>
	);
}
