import { FilePlusIcon, FileXIcon, PencilIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Action = "create" | "modify" | "delete";

type FileEntry = { action: Action; path: string };

const ACTION_META: Record<
	Action,
	{ label: string; badge: string; Icon: typeof FilePlusIcon }
> = {
	create: {
		label: "create",
		badge: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
		Icon: FilePlusIcon,
	},
	modify: {
		label: "modify",
		badge: "border-amber-500/40 text-amber-600 dark:text-amber-400",
		Icon: PencilIcon,
	},
	delete: {
		label: "delete",
		badge: "border-red-500/40 text-red-600 dark:text-red-400",
		Icon: FileXIcon,
	},
};

function parseEntries(text: string): FileEntry[] {
	const entries: FileEntry[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) {
			continue;
		}
		const match = /^(create|modify|delete)\s+(.+)$/i.exec(line);
		if (!match) {
			continue;
		}
		entries.push({
			action: match[1].toLowerCase() as Action,
			path: match[2].trim(),
		});
	}
	return entries;
}

/**
 * `FileMap` lists planned file changes. Children are raw lines of the form
 * `create|modify|delete <path>`. A flat list with per-line action badges is a
 * better fit than `FileTree` (which expects an explicit nested folder/file
 * structure), so we render a clean styled list here.
 */
export function FileMap({ children = "" }: { children?: string }) {
	const entries = parseEntries(children);
	if (entries.length === 0) {
		return null;
	}

	return (
		<ul className="my-4 divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-background/60">
			{entries.map((entry, i) => {
				const meta = ACTION_META[entry.action];
				return (
					<li
						key={`${entry.action}-${entry.path}-${i}`}
						className="flex items-center gap-3 px-3 py-2"
					>
						<span
							className={cn(
								"flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-micro uppercase",
								meta.badge,
							)}
						>
							<meta.Icon className="size-3" />
							{meta.label}
						</span>
						<span className="truncate font-mono text-small">{entry.path}</span>
					</li>
				);
			})}
		</ul>
	);
}
