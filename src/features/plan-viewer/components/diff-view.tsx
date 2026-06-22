import { GitCompareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { accentClasses } from "./shell/accent";
import { PlanBlockShell } from "./shell/plan-block-shell";

type DiffKind = "add" | "remove" | "context";
type DiffLine = { kind: DiffKind; text: string };

// Diff rows use a distinct GitHub-style fill (a subtle bg tint, no border)
// rather than the callout-card `container` accent — but the add/remove hue is
// still sourced from the shared accent system (`.header`) so it can't drift.
const LINE_STYLES: Record<DiffKind, string> = {
	add: cn("bg-emerald-500/10", accentClasses("success").header),
	remove: cn("bg-red-500/10", accentClasses("danger").header),
	context: "text-muted-foreground",
};

const GUTTER: Record<DiffKind, string> = {
	add: "+",
	remove: "-",
	context: " ",
};

function parseDiff(text: string): DiffLine[] {
	// Trim outer whitespace first so a trailing newline (common from editors)
	// doesn't render a phantom blank final row, and empty input yields no lines
	// (→ the component renders nothing). Interior blank context lines survive.
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return [];
	}
	const lines: DiffLine[] = [];
	for (const raw of trimmed.split(/\r?\n/)) {
		if (raw.startsWith("+")) {
			lines.push({ kind: "add", text: raw.slice(1) });
		} else if (raw.startsWith("-")) {
			lines.push({ kind: "remove", text: raw.slice(1) });
		} else {
			lines.push({ kind: "context", text: raw.replace(/^ /, "") });
		}
	}
	return lines;
}

/**
 * `Diff` renders a unified code diff with add/remove gutters and coloring.
 * Authored as `<Diff lang="ts">` with `+`/`-`/space-prefixed lines as children.
 */
export function Diff({
	lang,
	children = "",
}: {
	lang?: string;
	children?: string;
}) {
	const lines = parseDiff(children);
	if (lines.length === 0) {
		return null;
	}
	return (
		<PlanBlockShell
			accent="neutral"
			icon={GitCompareIcon}
			title={lang ? `Diff · ${lang}` : "Diff"}
			bodyClassName="p-0"
		>
			<pre className="overflow-x-auto py-1 font-mono text-micro leading-relaxed">
				{lines.map((line, i) => (
					<div
						key={`${i}-${line.text}`}
						className={cn("px-3", LINE_STYLES[line.kind])}
					>
						<span className="mr-2 select-none opacity-60">
							{GUTTER[line.kind]}
						</span>
						{line.text || " "}
					</div>
				))}
			</pre>
		</PlanBlockShell>
	);
}
