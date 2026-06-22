import {
	Bold,
	Code,
	Heading,
	Italic,
	Link2,
	List,
	ListChecks,
	ListOrdered,
	Quote,
	SquareCode,
	Strikethrough,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import {
	applyCodeBlock,
	applyLinePrefix,
	applyLink,
	applyWrap,
	type EditorState,
} from "./markdown-commands";

export type MarkdownAction = (state: EditorState) => EditorState;

type ToolItem = {
	key: string;
	label: string;
	icon: ComponentType<{ className?: string }>;
	run: MarkdownAction;
	shortcut?: string;
};

const GROUPS: ToolItem[][] = [
	[
		{
			key: "bold",
			label: "Bold",
			icon: Bold,
			run: (s) => applyWrap(s, "**"),
			shortcut: "⌘B",
		},
		{
			key: "italic",
			label: "Italic",
			icon: Italic,
			run: (s) => applyWrap(s, "*"),
			shortcut: "⌘I",
		},
		{
			key: "strike",
			label: "Strikethrough",
			icon: Strikethrough,
			run: (s) => applyWrap(s, "~~"),
		},
		{
			key: "code",
			label: "Inline code",
			icon: Code,
			run: (s) => applyWrap(s, "`"),
		},
	],
	[
		{
			key: "h2",
			label: "Heading",
			icon: Heading,
			run: (s) => applyLinePrefix(s, "## "),
		},
		{
			key: "quote",
			label: "Quote",
			icon: Quote,
			run: (s) => applyLinePrefix(s, "> "),
		},
	],
	[
		{
			key: "ul",
			label: "Bulleted list",
			icon: List,
			run: (s) => applyLinePrefix(s, "- "),
		},
		{
			key: "ol",
			label: "Numbered list",
			icon: ListOrdered,
			run: (s) => applyLinePrefix(s, "1. ", { ordered: true }),
		},
		{
			key: "task",
			label: "Checklist",
			icon: ListChecks,
			run: (s) => applyLinePrefix(s, "- [ ] "),
		},
	],
	[
		{ key: "link", label: "Link", icon: Link2, run: applyLink, shortcut: "⌘K" },
		{
			key: "codeblock",
			label: "Code block",
			icon: SquareCode,
			run: applyCodeBlock,
		},
	],
];

export function MarkdownToolbar({
	onAction,
	disabled,
}: {
	onAction: (run: MarkdownAction) => void;
	disabled?: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center gap-0.5">
			{GROUPS.map((group, gi) => (
				<div key={group[0].key} className="flex items-center gap-0.5">
					{gi > 0 ? <span className="mx-1 h-4 w-px bg-border/60" /> : null}
					{group.map((item) => {
						const Icon = item.icon;
						return (
							<button
								key={item.key}
								type="button"
								disabled={disabled}
								title={
									item.shortcut
										? `${item.label} (${item.shortcut})`
										: item.label
								}
								aria-label={item.label}
								// Keep textarea focus/selection: prevent the mousedown from
								// blurring it before the click handler reads the selection.
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => onAction(item.run)}
								className={cn(
									"flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors",
									"hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
								)}
							>
								<Icon className="size-3.5" />
							</button>
						);
					})}
				</div>
			))}
		</div>
	);
}
