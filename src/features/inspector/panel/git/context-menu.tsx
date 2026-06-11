// Right-click context menu for change rows (reveal in Finder, copy
// paths, copy remote file URL) plus the clipboard helper it uses.
import { CopyIcon, FolderOpenIcon, LinkIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { revealPathInFinder } from "@/lib/api";
import { buildRemoteFileUrl } from "@/lib/remote-file-url";
import type { ChangeRow } from "./shared";

async function copyToClipboard(value: string, label: string) {
	try {
		await navigator.clipboard.writeText(value);
		toast.success(`${label} copied`, { description: value, duration: 2000 });
	} catch {
		toast.error(`Failed to copy ${label.toLowerCase()}`);
	}
}

export function ChangesRowsContextMenu({
	changes,
	workspaceBranch,
	workspaceRemoteUrl,
	children,
}: {
	changes: ChangeRow[];
	workspaceBranch: string | null;
	workspaceRemoteUrl: string | null;
	children: React.ReactNode;
}) {
	const [activeFile, setActiveFile] = useState<ChangeRow | null>(null);
	const filesByPath = useMemo(
		() => new Map(changes.map((change) => [change.path, change])),
		[changes],
	);
	const handleContextMenu = useCallback(
		(event: React.MouseEvent<HTMLElement>) => {
			const target = event.target;
			const row =
				target instanceof Element
					? target.closest<HTMLElement>("[data-change-path]")
					: null;
			const path = row?.dataset.changePath;
			const file = path ? (filesByPath.get(path) ?? null) : null;
			setActiveFile(file);
			if (!file) {
				event.preventDefault();
			}
		},
		[filesByPath],
	);

	return (
		<ContextMenu onOpenChange={(open) => !open && setActiveFile(null)}>
			<ContextMenuTrigger asChild>
				<div onContextMenu={handleContextMenu}>{children}</div>
			</ContextMenuTrigger>
			{activeFile && (
				<FileRowContextMenuContent
					file={activeFile}
					workspaceBranch={workspaceBranch}
					workspaceRemoteUrl={workspaceRemoteUrl}
				/>
			)}
		</ContextMenu>
	);
}

function FileRowContextMenuContent({
	file,
	workspaceBranch,
	workspaceRemoteUrl,
}: {
	file: ChangeRow;
	workspaceBranch: string | null;
	workspaceRemoteUrl: string | null;
}) {
	const remoteFileUrl = useMemo(
		() => buildRemoteFileUrl(workspaceRemoteUrl, workspaceBranch, file.path),
		[file.path, workspaceBranch, workspaceRemoteUrl],
	);

	const handleReveal = useCallback(async () => {
		try {
			await revealPathInFinder(file.absolutePath);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to reveal in Finder";
			toast.error(message);
		}
	}, [file.absolutePath]);

	const handleCopyAbsolute = useCallback(
		() => copyToClipboard(file.absolutePath, "Path"),
		[file.absolutePath],
	);
	const handleCopyRelative = useCallback(
		() => copyToClipboard(file.path, "Relative path"),
		[file.path],
	);
	const handleCopyRemoteUrl = useCallback(() => {
		if (!remoteFileUrl) return;
		void copyToClipboard(remoteFileUrl, "Remote file URL");
	}, [remoteFileUrl]);

	return (
		<ContextMenuContent className="min-w-52">
			<ContextMenuItem onClick={() => void handleReveal()}>
				<FolderOpenIcon />
				<span>Reveal in Finder</span>
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={handleCopyAbsolute}>
				<CopyIcon />
				<span>Copy Path</span>
			</ContextMenuItem>
			<ContextMenuItem onClick={handleCopyRelative}>
				<CopyIcon />
				<span>Copy Relative Path</span>
			</ContextMenuItem>
			<ContextMenuItem onClick={handleCopyRemoteUrl} disabled={!remoteFileUrl}>
				<LinkIcon />
				<span>Copy Remote File URL</span>
			</ContextMenuItem>
		</ContextMenuContent>
	);
}
