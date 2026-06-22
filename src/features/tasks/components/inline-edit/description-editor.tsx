import { Suspense, useEffect, useState } from "react";
import { LazyStreamdown } from "@/components/streamdown-loader";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "./markdown-editor";

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

export function DescriptionEditor({
	value,
	onSave,
	disabled,
}: {
	value: string | null;
	onSave: (next: string) => void;
	disabled?: boolean;
}) {
	const initial = value ?? "";
	const [draft, setDraft] = useState(initial);
	const [editing, setEditing] = useState(false);

	useEffect(() => {
		if (!editing) setDraft(initial);
	}, [initial, editing]);

	const dirty = draft !== initial;

	function commit() {
		onSave(draft);
		setEditing(false);
	}
	function cancel() {
		setDraft(initial);
		setEditing(false);
	}

	function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
		const mod = event.metaKey || event.ctrlKey;
		if (mod && event.key === "Enter") {
			event.preventDefault();
			commit();
		} else if (event.key === "Escape") {
			event.preventDefault();
			cancel();
		}
	}

	if (!editing) {
		return (
			<button
				type="button"
				disabled={disabled}
				onClick={() => !disabled && setEditing(true)}
				className="block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/40"
			>
				{initial ? (
					<Rendered markdown={initial} />
				) : (
					<span className="text-muted-foreground/60 text-ui italic">
						Add a description…
					</span>
				)}
			</button>
		);
	}

	return (
		<div className="flex flex-col gap-2 rounded-md border border-border/60 bg-background/40 p-1.5 focus-within:border-border">
			<MarkdownEditor
				value={draft}
				onChange={setDraft}
				disabled={disabled}
				autoFocus
				placeholder="Add a description… (markdown supported)"
				onKeyDown={onKeyDown}
			/>
			<div className="flex items-center gap-2 px-0.5">
				<Button type="button" size="sm" disabled={!dirty} onClick={commit}>
					Save
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={cancel}>
					Cancel
				</Button>
				<span className="ml-auto text-muted-foreground/70 text-mini">
					⌘B · ⌘I · ⌘K · ⌘↵ to save
				</span>
			</div>
		</div>
	);
}
