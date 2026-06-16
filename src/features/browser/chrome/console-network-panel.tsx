// Collapsible console/network panel for the browser surface. Subscribes to the
// per-mount bridge store and renders buffered console errors/warnings and
// failed/slow network requests routed in via `UiMutationEvent`. Purely
// presentational beyond reading the store; clearing is owned upstream.
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ConsoleEntry, NetworkEntry } from "../bridge/channel";
import type { UseBrowserBridgeStore } from "../bridge/use-browser-bridge";

type ConsoleNetworkPanelProps = {
	store: UseBrowserBridgeStore;
	onClose: () => void;
};

const LEVEL_CLASS: Record<ConsoleEntry["level"], string> = {
	error: "text-destructive",
	warn: "text-amber-500",
	info: "text-muted-foreground",
	log: "text-muted-foreground",
};

function ConsoleRow({ entry }: { entry: ConsoleEntry }) {
	return (
		<li className="flex items-start gap-2 px-3 py-1 font-mono text-xs">
			<span className={cn("shrink-0 uppercase", LEVEL_CLASS[entry.level])}>
				{entry.level}
			</span>
			<span className="min-w-0 break-words text-foreground/90">
				{entry.message}
			</span>
		</li>
	);
}

function NetworkRow({ entry }: { entry: NetworkEntry }) {
	return (
		<li className="flex items-start gap-2 px-3 py-1 font-mono text-xs">
			<span
				className={cn(
					"shrink-0",
					entry.failed ? "text-destructive" : "text-amber-500",
				)}
			>
				{entry.status ?? "ERR"}
			</span>
			<span className="shrink-0 text-muted-foreground">{entry.method}</span>
			<span className="min-w-0 flex-1 truncate text-foreground/90">
				{entry.url}
			</span>
			<span className="shrink-0 text-muted-foreground">
				{Math.round(entry.durationMs)}ms
			</span>
		</li>
	);
}

export function ConsoleNetworkPanel({
	store,
	onClose,
}: ConsoleNetworkPanelProps) {
	const consoleEntries = store((s) => s.consoleEntries);
	const networkEntries = store((s) => s.networkEntries);
	const isEmpty = consoleEntries.length === 0 && networkEntries.length === 0;

	return (
		<section
			aria-label="Console and network"
			className="flex max-h-56 min-h-0 flex-col border-border/40 border-t bg-editor-chrome"
		>
			<header className="flex h-7 shrink-0 items-center justify-between px-3">
				<span className="font-medium text-muted-foreground text-xs">
					Console / Network
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					aria-label="Close console panel"
					onClick={onClose}
					className="text-muted-foreground hover:text-foreground"
				>
					<X className="size-3.5" strokeWidth={1.8} />
				</Button>
			</header>
			<ScrollArea className="min-h-0 flex-1">
				{isEmpty ? (
					<p className="px-3 py-4 text-muted-foreground text-xs">
						No console or network activity captured yet.
					</p>
				) : (
					<ul className="pb-2">
						{consoleEntries.map((entry, index) => (
							<ConsoleRow key={`c-${index}-${entry.ts}`} entry={entry} />
						))}
						{networkEntries.map((entry, index) => (
							<NetworkRow key={`n-${index}-${entry.url}`} entry={entry} />
						))}
					</ul>
				)}
			</ScrollArea>
		</section>
	);
}
