import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	type LinearIssueDetail,
	linearGetTask,
	tasksFindWorkspaceForLinearTask,
	tasksFindWorkspaceForPrUrl,
} from "@/lib/api";
import type { TaskListItem } from "../types";

const PANEL_WIDTH = 520;

export function DetailPanel({
	item,
	onClose,
	onOpenWorkspace,
	onStartWorkspace,
}: {
	item: TaskListItem;
	onClose: () => void;
	onOpenWorkspace: (workspaceId: string) => void;
	onStartWorkspace: (item: TaskListItem) => void;
}) {
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !e.defaultPrevented) {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onClose]);

	return (
		<aside
			className="flex h-full flex-col border-l border-border bg-background"
			style={{ width: PANEL_WIDTH }}
		>
			<header className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
				<Button variant="ghost" size="sm" onClick={onClose} className="gap-1">
					<ArrowLeft className="size-3" />
					Back
				</Button>
				<span className="text-xs text-muted-foreground">{item.displayId}</span>
				<Button
					variant="ghost"
					size="sm"
					className="ml-auto gap-1"
					onClick={() => void openUrl(item.url)}
				>
					<ExternalLink className="size-3" />
					Open
				</Button>
			</header>
			<div className="min-h-0 flex-1 overflow-auto px-3 py-3">
				<h2 className="text-sm font-medium">{item.title}</h2>
				<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<span
						className="rounded px-1.5 py-0.5"
						style={{
							background: `${item.status.color}33`,
							color: item.status.color,
						}}
					>
						{item.status.label}
					</span>
					{item.assignee ? <span>{item.assignee.login}</span> : null}
					{item.labels.length > 0 ? (
						<div className="flex flex-wrap gap-1">
							{item.labels.map((label) => (
								<span
									key={label.name}
									className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
									style={{ color: label.color }}
								>
									{label.name}
								</span>
							))}
						</div>
					) : null}
				</div>
				<div className="mt-4">
					{item.source === "linear" ? (
						<LinearBody itemKey={item.key} />
					) : (
						<GhBody />
					)}
				</div>
			</div>
			<footer className="border-t border-border/50 bg-muted/20 px-3 py-2">
				<WorkspaceActions
					item={item}
					onOpenWorkspace={onOpenWorkspace}
					onStartWorkspace={onStartWorkspace}
				/>
			</footer>
		</aside>
	);
}

function LinearBody({ itemKey }: { itemKey: string }) {
	const query = useQuery<LinearIssueDetail>({
		queryKey: ["tasks", "detail", "linear", itemKey],
		queryFn: () => linearGetTask(itemKey),
		staleTime: 5 * 60_000,
	});
	if (query.isLoading) return <Placeholder>Loading…</Placeholder>;
	if (query.isError)
		return <Placeholder>Failed to load: {String(query.error)}</Placeholder>;
	if (!query.data?.description.trim())
		return <Placeholder>No description.</Placeholder>;
	return (
		<pre className="whitespace-pre-wrap text-xs text-foreground">
			{query.data.description}
		</pre>
	);
}

function GhBody() {
	return (
		<Placeholder>
			Open in browser to see the full description. Inline body rendering is a
			follow-up.
		</Placeholder>
	);
}

function Placeholder({ children }: { children: ReactNode }) {
	return <div className="text-xs text-muted-foreground">{children}</div>;
}

function WorkspaceActions({
	item,
	onOpenWorkspace,
	onStartWorkspace,
}: {
	item: TaskListItem;
	onOpenWorkspace: (workspaceId: string) => void;
	onStartWorkspace: (item: TaskListItem) => void;
}) {
	const linked = useQuery<string | null>({
		queryKey: ["tasks", "linkedWorkspace", item.source, item.key],
		queryFn: async () => {
			if (item.source === "linear") {
				return await tasksFindWorkspaceForLinearTask(item.key);
			}
			if (item.source === "github-pr") {
				return await tasksFindWorkspaceForPrUrl(item.url);
			}
			return null;
		},
		staleTime: 30_000,
	});

	return (
		<div className="flex items-center gap-2">
			{linked.data ? (
				<Button
					size="sm"
					onClick={() => onOpenWorkspace(linked.data as string)}
				>
					Open workspace
				</Button>
			) : null}
			<Button
				size="sm"
				variant="outline"
				onClick={() => onStartWorkspace(item)}
			>
				Start workspace from this
			</Button>
		</div>
	);
}
