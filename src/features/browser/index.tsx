// WorkspaceBrowserSurface: the in-app browser surface (peer to the Monaco
// editor). Composes the tab strip, the URL/address bar, and the content host
// that positions the embedded webview. All state is owned by the
// `BrowserSessionController` upstream — this surface is presentational and
// drives everything through callbacks.
import { useEffect } from "react";
import { TrafficLightSpacer } from "@/components/chrome/traffic-light-spacer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BrowserTabs } from "./chrome/browser-tabs";
import { UrlBar } from "./chrome/url-bar";
import { ContentHost } from "./content-host";
import { activeTab, type BrowserTab } from "./tab-model";

const BROWSER_CHROME_BACKGROUND_CLASS = "bg-editor-chrome";

type WorkspaceBrowserSurfaceProps = {
	tabs: BrowserTab[];
	activeTabId: string | null;
	onNavigate: (url: string) => void;
	onSelectTab: (id: string) => void;
	onCloseTab: (id: string) => void;
	onOpenUrl: (url: string) => void;
	onExit: () => void;
};

export function WorkspaceBrowserSurface({
	tabs,
	activeTabId,
	onNavigate,
	onSelectTab,
	onCloseTab,
	onOpenUrl,
	onExit,
}: WorkspaceBrowserSurfaceProps) {
	const current = activeTabId ? activeTab(tabs, activeTabId) : null;
	const currentUrl = current?.url ?? "";

	// Esc exits the browser surface, mirroring the editor surface.
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			onExit();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onExit]);

	return (
		<section
			aria-label="Workspace browser surface"
			data-focus-scope="browser"
			className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground focus:outline-none"
		>
			<div
				className={cn("flex h-9 items-center", BROWSER_CHROME_BACKGROUND_CLASS)}
				data-tauri-drag-region
			>
				<TrafficLightSpacer side="left" width={86} />
				<div
					data-tauri-drag-region
					className="flex min-w-0 flex-1 items-center"
				>
					<BrowserTabs
						tabs={tabs}
						activeTabId={activeTabId}
						onSelectTab={onSelectTab}
						onCloseTab={onCloseTab}
						onNewTab={() => onOpenUrl("about:blank")}
					/>
				</div>
				<div className="flex shrink-0 items-center gap-0 pr-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onExit}
						aria-label="Close browser view"
						className="gap-1 px-1.5 text-muted-foreground hover:text-foreground"
					>
						<span>Close</span>
					</Button>
				</div>
			</div>

			<div
				className={cn(
					"flex items-center border-border/40 border-b",
					BROWSER_CHROME_BACKGROUND_CLASS,
				)}
			>
				<UrlBar
					url={currentUrl}
					onNavigate={onNavigate}
					onBack={() => {}}
					onForward={() => {}}
					onReload={() => onNavigate(currentUrl)}
				/>
			</div>

			<ContentHost url={current?.url ?? null} />
		</section>
	);
}
