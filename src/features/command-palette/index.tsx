import { TerminalIcon } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { FileIcon } from "@/features/file-browser/file-icon";
import { useEditorActions } from "@/shell/editor-actions-context";

import { useCommandRegistry } from "./hooks/use-command-registry";
import { useFileSearch } from "./hooks/use-file-search";
import { usePaletteController } from "./hooks/use-palette-state";
import { parseMode } from "./lib/parse-mode";

interface Props {
	workspaceRootPath: string | null;
}

export function CommandPaletteDialog({ workspaceRootPath }: Props) {
	const controller = usePaletteController();
	const editorActions = useEditorActions();
	const commands = useCommandRegistry();
	const [input, setInput] = useState("");

	// When the controller opens (or re-opens with a different prefix), seed
	// the input. Closing doesn't reset — closing-and-reopening is the cue
	// to clear (handled by `controller.open` resetting `initial`).
	useEffect(() => {
		if (controller.isOpen) {
			setInput(controller.initial);
		}
	}, [controller.isOpen, controller.initial]);

	const { mode, query } = useMemo(() => parseMode(input), [input]);

	const fileSearch = useFileSearch(
		workspaceRootPath,
		query,
		controller.isOpen && mode === "files",
	);

	const filteredCommands = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return commands;
		return commands.filter(
			(c) =>
				c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
		);
	}, [commands, query]);

	const recents = editorActions.recents;
	const showRecents = mode === "files" && query.trim().length === 0;

	function handleFilePick(hit: {
		absolutePath: string;
		path: string;
		name: string;
	}) {
		editorActions.openFile({
			absolutePath: hit.absolutePath,
			relativePath: hit.path,
			fileName: hit.name,
		});
		controller.close();
	}

	function handleRecentPick(item: {
		absolutePath: string;
		relativePath: string;
		fileName: string;
	}) {
		editorActions.openFile(item);
		controller.close();
	}

	function handleCommandPick(id: string) {
		const cmd = commands.find((c) => c.id === id);
		controller.close();
		if (cmd) void cmd.run();
	}

	return (
		<CommandDialog
			open={controller.isOpen}
			onOpenChange={(open) => {
				if (!open) controller.close();
			}}
			title={mode === "commands" ? "Run a command" : "Open file"}
			description={
				mode === "commands"
					? "Type to filter commands. Press Enter to run."
					: "Type to fuzzy-match a file name. Press Enter to open."
			}
		>
			<Command shouldFilter={false}>
				<CommandInput
					placeholder={
						mode === "commands"
							? "Type a command (> prefix to switch modes)"
							: "Search files by name (use > for commands)"
					}
					value={input}
					onValueChange={setInput}
					autoFocus
				/>
				<CommandList>
					{mode === "files" && showRecents && recents.length > 0 && (
						<CommandGroup heading="Recent">
							{recents.map((r) => (
								<CommandItem
									key={r.absolutePath}
									value={`recent:${r.absolutePath}`}
									onSelect={() => handleRecentPick(r)}
								>
									<FileRow
										fileName={r.fileName}
										relativePath={r.relativePath}
									/>
								</CommandItem>
							))}
						</CommandGroup>
					)}

					{mode === "files" && showRecents && recents.length === 0 && (
						<CommandEmpty>
							<span className="text-muted-foreground">
								Start typing to search files.
							</span>
						</CommandEmpty>
					)}

					{mode === "files" && !showRecents && (
						<>
							{fileSearch.error && (
								<CommandEmpty>
									<span className="text-destructive">{fileSearch.error}</span>
								</CommandEmpty>
							)}
							{!fileSearch.error && fileSearch.hits.length === 0 && (
								<CommandEmpty>
									<span className="text-muted-foreground">
										{fileSearch.loading ? "Searching…" : "No matching files."}
									</span>
								</CommandEmpty>
							)}
							{fileSearch.hits.length > 0 && (
								<CommandGroup heading="Files">
									{fileSearch.hits.map((hit) => (
										<CommandItem
											key={hit.absolutePath}
											value={`file:${hit.absolutePath}`}
											onSelect={() => handleFilePick(hit)}
										>
											<FileRow fileName={hit.name} relativePath={hit.path} />
										</CommandItem>
									))}
								</CommandGroup>
							)}
						</>
					)}

					{mode === "commands" &&
						(filteredCommands.length === 0 ? (
							<CommandEmpty>
								<span className="text-muted-foreground">
									No matching commands.
								</span>
							</CommandEmpty>
						) : (
							renderCommandGroups(filteredCommands, handleCommandPick)
						))}
				</CommandList>
				<PaletteFooter mode={mode} />
			</Command>
		</CommandDialog>
	);
}

function PaletteFooter({ mode }: { mode: "files" | "commands" }) {
	const selectLabel = mode === "commands" ? "Run" : "Open";
	return (
		<div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground">
			<div className="flex items-center gap-3">
				<KbdHint keys={["↑", "↓"]} label="Navigate" />
				<KbdHint keys={["↵"]} label={selectLabel} />
				<KbdHint keys={["esc"]} label="Close" />
			</div>
			<span className="hidden sm:inline">
				{mode === "commands" ? (
					<>
						Clear <kbd className="font-mono text-app-foreground">&gt;</kbd> for
						files
					</>
				) : (
					<>
						Type <kbd className="font-mono text-app-foreground">&gt;</kbd> for
						commands
					</>
				)}
			</span>
		</div>
	);
}

function KbdHint({ keys, label }: { keys: string[]; label: string }) {
	return (
		<span className="flex items-center gap-1">
			{keys.map((k) => (
				<kbd
					key={k}
					className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/60 bg-muted/60 px-1 font-mono text-[10px] text-app-foreground"
				>
					{k}
				</kbd>
			))}
			<span>{label}</span>
		</span>
	);
}

function FileRow({
	fileName,
	relativePath,
}: {
	fileName: string;
	relativePath: string;
}) {
	const lastSlash = relativePath.lastIndexOf("/");
	const directory = lastSlash >= 0 ? relativePath.slice(0, lastSlash) : "";
	const extension = (() => {
		const dot = fileName.lastIndexOf(".");
		if (dot <= 0) return null;
		return fileName.slice(dot + 1).toLowerCase();
	})();
	const segments = directory.length > 0 ? directory.split("/") : [];

	return (
		<>
			<FileIcon name={fileName} kind="file" className="size-4" />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate text-sm text-app-foreground">{fileName}</span>
				{segments.length > 0 && (
					<span className="truncate text-[11px] text-muted-foreground/70">
						{segments.map((seg, i) => (
							<span key={`${seg}-${i}`}>
								{i > 0 && (
									<span className="mx-1 text-muted-foreground/40">›</span>
								)}
								{seg}
							</span>
						))}
					</span>
				)}
			</div>
			{extension && (
				<span className="ml-2 shrink-0 rounded bg-muted/60 px-1.5 py-[1px] font-mono text-[10px] uppercase text-muted-foreground">
					{extension}
				</span>
			)}
		</>
	);
}

function renderCommandGroups(
	commands: Array<{ id: string; title: string; group?: string }>,
	onSelect: (id: string) => void,
) {
	const groups = new Map<string, typeof commands>();
	for (const cmd of commands) {
		const key = cmd.group ?? "Other";
		const arr = groups.get(key) ?? [];
		arr.push(cmd);
		groups.set(key, arr);
	}
	const entries = Array.from(groups.entries());
	return entries.map(([heading, items], idx) => (
		<Fragment key={heading}>
			{idx > 0 && <CommandSeparator />}
			<CommandGroup heading={heading}>
				{items.map((c) => (
					<CommandItem
						key={c.id}
						value={`cmd:${c.id}`}
						onSelect={() => onSelect(c.id)}
					>
						<TerminalIcon className="size-4 opacity-60" />
						<span className="truncate">{c.title}</span>
					</CommandItem>
				))}
			</CommandGroup>
		</Fragment>
	));
}

export {
	PaletteStateProvider,
	usePaletteController,
} from "./hooks/use-palette-state";
