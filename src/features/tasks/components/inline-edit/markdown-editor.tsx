import { Suspense, useLayoutEffect, useRef, useState } from "react";
import { LazyStreamdown } from "@/components/streamdown-loader";
import { cn } from "@/lib/utils";
import type { EditorState } from "./markdown-commands";
import { applyLink, applyWrap } from "./markdown-commands";
import { type MarkdownAction, MarkdownToolbar } from "./markdown-toolbar";

type Tab = "write" | "preview";

/** Formatted markdown, the same renderer used in the conversation view. */
function Rendered({ markdown }: { markdown: string }) {
	return (
		<Suspense
			fallback={
				<div className="whitespace-pre-wrap text-muted-foreground text-ui leading-relaxed">
					{markdown}
				</div>
			}
		>
			<LazyStreamdown
				animated={false}
				mode="static"
				className="conversation-streamdown text-ui"
			>
				{markdown}
			</LazyStreamdown>
		</Suspense>
	);
}

/**
 * Controlled markdown editor: formatting toolbar + Write/Preview tabs + an
 * auto-growing textarea. Shared by the task description field and the
 * new-task modal. Cmd/Ctrl+B/I/K apply inline formatting; any other key is
 * forwarded to `onKeyDown` first (so a parent can own Cmd+Enter / Esc).
 */
export function MarkdownEditor({
	value,
	onChange,
	placeholder,
	disabled,
	autoFocus,
	minHeightClass = "min-h-40",
	onKeyDown,
}: {
	value: string;
	onChange: (next: string) => void;
	placeholder?: string;
	disabled?: boolean;
	autoFocus?: boolean;
	minHeightClass?: string;
	onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
	const [tab, setTab] = useState<Tab>("write");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	// Selection range to restore after a toolbar edit rewrites the value.
	const pendingSelection = useRef<[number, number] | null>(null);

	function autoResize() {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}

	useLayoutEffect(() => {
		if (tab !== "write") return;
		autoResize();
		if (pendingSelection.current && textareaRef.current) {
			const [start, end] = pendingSelection.current;
			textareaRef.current.focus();
			textareaRef.current.setSelectionRange(start, end);
			pendingSelection.current = null;
		}
	}, [value, tab]);

	function runAction(run: MarkdownAction) {
		const el = textareaRef.current;
		const state: EditorState = el
			? { value, start: el.selectionStart, end: el.selectionEnd }
			: { value, start: value.length, end: value.length };
		const next = run(state);
		onChange(next.value);
		pendingSelection.current = [next.start, next.end];
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
		onKeyDown?.(event);
		if (event.defaultPrevented) return;
		const mod = event.metaKey || event.ctrlKey;
		if (mod && event.key.toLowerCase() === "b") {
			event.preventDefault();
			runAction((s) => applyWrap(s, "**"));
		} else if (mod && event.key.toLowerCase() === "i") {
			event.preventDefault();
			runAction((s) => applyWrap(s, "*"));
		} else if (mod && event.key.toLowerCase() === "k") {
			event.preventDefault();
			runAction(applyLink);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2 px-0.5">
				{tab === "write" ? (
					<MarkdownToolbar onAction={runAction} disabled={disabled} />
				) : (
					<span className="text-muted-foreground text-small">Preview</span>
				)}
				<div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 p-0.5">
					{(["write", "preview"] as Tab[]).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setTab(t)}
							className={cn(
								"cursor-pointer rounded px-2 py-0.5 text-small capitalize transition-colors",
								tab === t
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{t}
						</button>
					))}
				</div>
			</div>

			{tab === "write" ? (
				<textarea
					ref={textareaRef}
					// biome-ignore lint/a11y/noAutofocus: opt-in focus when an editor opens
					autoFocus={autoFocus}
					value={value}
					disabled={disabled}
					onChange={(event) => {
						onChange(event.target.value);
						autoResize();
					}}
					onKeyDown={handleKeyDown}
					placeholder={placeholder ?? "Write in markdown…"}
					className={cn(
						"w-full resize-none overflow-hidden rounded bg-transparent px-2 py-1.5 text-ui leading-relaxed outline-none placeholder:text-muted-foreground/60",
						minHeightClass,
					)}
				/>
			) : (
				<div className={cn("px-2 py-1.5", minHeightClass)}>
					{value.trim() ? (
						<Rendered markdown={value} />
					) : (
						<span className="text-muted-foreground/60 text-ui italic">
							Nothing to preview yet.
						</span>
					)}
				</div>
			)}
		</div>
	);
}
