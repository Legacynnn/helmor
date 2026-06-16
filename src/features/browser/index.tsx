// WorkspaceBrowserSurface: the in-app browser surface (peer to the Monaco
// editor). Composes the tab strip, the URL/address bar, and the content host
// that positions the embedded webview. All state is owned by the
// `BrowserSessionController` upstream — this surface is presentational and
// drives everything through callbacks.
import { useCallback, useEffect, useRef, useState } from "react";
import { TrafficLightSpacer } from "@/components/chrome/traffic-light-spacer";
import { Button } from "@/components/ui/button";
import { browserListComments, browserSendBridgeMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BridgeMode } from "./bridge/channel";
import type { CommentPin } from "./bridge/comments";
import {
	createBrowserBridgeStore,
	registerBridgeStore,
} from "./bridge/use-browser-bridge";
import { BrowserTabs } from "./chrome/browser-tabs";
import { ConsoleNetworkPanel } from "./chrome/console-network-panel";
import { ModeToolbar } from "./chrome/mode-toolbar";
import { UrlBar } from "./chrome/url-bar";
import { ContentHost } from "./content-host";
import { activeTab, type BrowserTab } from "./tab-model";

/** Build an in-memory {@link CommentPin} from a persisted DB row. */
function pinFromRow(row: {
	id: string;
	selector: string;
	text: string;
	outerHTML: string;
	rectJson: string;
}): CommentPin {
	let rect = { x: 0, y: 0, width: 0, height: 0 };
	try {
		const parsed = JSON.parse(row.rectJson);
		if (parsed && typeof parsed === "object") rect = { ...rect, ...parsed };
	} catch {
		// Keep the zero rect; re-anchoring on load refreshes it from the DOM.
	}
	return {
		id: row.id,
		selector: row.selector,
		text: row.text,
		outerHTML: row.outerHTML,
		rect,
		resolved: true,
	};
}

const BROWSER_CHROME_BACKGROUND_CLASS = "bg-editor-chrome";

type WorkspaceBrowserSurfaceProps = {
	/** Owning workspace; scopes the bridge store + persisted comments. */
	workspaceId: string | null;
	tabs: BrowserTab[];
	activeTabId: string | null;
	onNavigate: (url: string) => void;
	onSelectTab: (id: string) => void;
	onCloseTab: (id: string) => void;
	onOpenUrl: (url: string) => void;
	onExit: () => void;
};

export function WorkspaceBrowserSurface({
	workspaceId,
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

	// Active inspector mode. Lives here (surface-local UI state); only one mode
	// is active at a time. Driving the injected bridge runs through the Rust
	// `browser_send_bridge_message` command (host → page eval).
	const [mode, setMode] = useState<BridgeMode>("none");

	// Console/network panel visibility (surface-local UI state). Toggled from the
	// mode toolbar; independent of the active inspector mode.
	const [consoleOpen, setConsoleOpen] = useState(false);

	// Per-mount bridge store. Created once; registered in the module registry so
	// the global UI-sync bridge can route page → host events here by workspace.
	const storeRef = useRef<ReturnType<typeof createBrowserBridgeStore> | null>(
		null,
	);
	if (!storeRef.current) storeRef.current = createBrowserBridgeStore();

	useEffect(() => {
		if (!workspaceId || !storeRef.current) return;
		return registerBridgeStore(workspaceId, storeRef.current);
	}, [workspaceId]);

	// Seed the injected bridge with its context (workspace + current url) so the
	// page echoes them back on every event, letting Rust scope persistence.
	useEffect(() => {
		if (!workspaceId) return;
		void browserSendBridgeMessage({
			kind: "set-context",
			workspaceId,
			url: currentUrl,
		}).catch(() => {
			// No-op under jsdom / when the Tauri bridge is unavailable.
		});
	}, [workspaceId, currentUrl]);

	// Hydrate persisted comments for the active page on load / url change so
	// pins survive reloads and window switches. Re-anchoring against the live
	// DOM happens page-side when the bridge re-runs; here we seed the store.
	useEffect(() => {
		if (!workspaceId || !currentUrl) return;
		let cancelled = false;
		void browserListComments(workspaceId, currentUrl)
			.then((rows) => {
				if (cancelled || !storeRef.current) return;
				storeRef.current.getState().hydrateComments(rows.map(pinFromRow));
			})
			.catch(() => {
				// No-op under jsdom / when the Tauri bridge is unavailable.
			});
		return () => {
			cancelled = true;
		};
	}, [workspaceId, currentUrl]);

	const applyMode = useCallback((next: BridgeMode) => {
		setMode(next);
		void browserSendBridgeMessage({ kind: "set-mode", mode: next }).catch(
			() => {
				// No-op under jsdom / when the Tauri bridge is unavailable.
			},
		);
	}, []);

	// Esc handling: when an inspector mode is active, `ModeToolbar` owns the
	// reset-to-Navigate. Only exit the browser surface when already in Navigate
	// (mirroring the editor surface), so a single Esc never both resets the mode
	// AND closes the surface.
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (mode !== "none") return;
			event.preventDefault();
			onExit();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onExit, mode]);

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
				<div className="flex shrink-0 items-center pr-2">
					<ModeToolbar
						mode={mode}
						onSetMode={applyMode}
						consoleOpen={consoleOpen}
						onToggleConsole={() => setConsoleOpen((open) => !open)}
					/>
				</div>
			</div>

			<ContentHost url={current?.url ?? null} />

			{consoleOpen && storeRef.current ? (
				<ConsoleNetworkPanel
					store={storeRef.current}
					onClose={() => setConsoleOpen(false)}
				/>
			) : null}
		</section>
	);
}
