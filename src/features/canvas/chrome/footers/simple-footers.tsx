import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import { workspaceDetailQueryOptions } from "@/lib/query-client";
import { useCanvasWorkspace } from "../../canvas-workspace-context";
import type { PanelConfig } from "../../panel-config";

/** Trailing muted segment helper — keeps the footers visually consistent. */
function Muted({ children }: { children: ReactNode }) {
	return <span className="truncate opacity-70">{children}</span>;
}

export function TerminalFooter({ config }: { config: PanelConfig }) {
	const id = config.instanceId?.slice(0, 8);
	return (
		<>
			<span className="truncate font-medium">Terminal</span>
			{id ? <Muted>{id}</Muted> : null}
		</>
	);
}

export function EditorFooter({ config }: { config: PanelConfig }) {
	const path = config.filePath;
	if (!path) return <span className="truncate opacity-70">No file</span>;
	const name = path.split("/").pop() ?? path;
	const ext = name.includes(".") ? name.split(".").pop() : null;
	return (
		<>
			<span className="min-w-0 flex-1 truncate font-medium">{name}</span>
			{ext ? <Muted>{ext}</Muted> : null}
		</>
	);
}

export function FilesFooter({ config }: { config: PanelConfig }) {
	return (
		<span className="min-w-0 flex-1 truncate">
			<span className="font-medium">Files</span>
			<span className="opacity-70"> · {config.rootSubpath || "root"}</span>
		</span>
	);
}

export function GitFooter() {
	const { workspaceId } = useCanvasWorkspace();
	const detail = useQuery(workspaceDetailQueryOptions(workspaceId));
	const branch = detail.data?.branch ?? null;
	return (
		<span className="flex min-w-0 items-center gap-1">
			<GitBranch className="size-2.5 shrink-0 opacity-70" />
			<span className="truncate">{branch ?? "Changes"}</span>
		</span>
	);
}

export function NotesFooter({ config }: { config: PanelConfig }) {
	const text = config.notes?.trim() ?? "";
	const words = text ? text.split(/\s+/).length : 0;
	return (
		<span className="truncate opacity-70">
			{words} {words === 1 ? "word" : "words"}
		</span>
	);
}

export function DrawingFooter({ config }: { config: PanelConfig }) {
	return (
		<span className="truncate opacity-70">
			{config.drawing ? "Drawing" : "Empty canvas"}
		</span>
	);
}

export function PlaceholderFooter({ label }: { label: string }) {
	return <span className="truncate opacity-70">{label}</span>;
}
