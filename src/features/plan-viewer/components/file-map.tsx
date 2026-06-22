import { FilePlusIcon, FilesIcon, FileXIcon, PencilIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { accentClasses, type PlanAccent } from "./shell/accent";
import { PlanBlockShell } from "./shell/plan-block-shell";

type Action = "create" | "modify" | "delete";

type FileEntry = { action: Action; path: string };

const ACTION_META: Record<
	Action,
	{ label: string; accent: PlanAccent; Icon: typeof FilePlusIcon }
> = {
	create: { label: "create", accent: "success", Icon: FilePlusIcon },
	modify: { label: "modify", accent: "warning", Icon: PencilIcon },
	delete: { label: "delete", accent: "danger", Icon: FileXIcon },
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
 * `create|modify|delete <path>`. Rendered as a styled list inside the shared
 * shell, with per-line action badges colored via the shared accent system.
 */
export function FileMap({ children = "" }: { children?: string }) {
	const entries = parseEntries(children);
	if (entries.length === 0) {
		return null;
	}

	return (
		<PlanBlockShell
			accent="neutral"
			icon={FilesIcon}
			title="File changes"
			badge={
				<span className="rounded border border-border/70 px-1.5 py-0.5 font-mono text-micro text-muted-foreground">
					{entries.length}
				</span>
			}
			bodyClassName="p-0"
		>
			<ul className="divide-y divide-border/60">
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
									accentClasses(meta.accent).badge,
								)}
							>
								<meta.Icon className="size-3" />
								{meta.label}
							</span>
							<span className="truncate font-mono text-small">
								{entry.path}
							</span>
						</li>
					);
				})}
			</ul>
		</PlanBlockShell>
	);
}
