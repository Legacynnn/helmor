import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function EditableTitle({
	value,
	onSave,
	disabled,
}: {
	value: string;
	onSave: (next: string) => void;
	disabled?: boolean;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		setDraft(value);
	}, [value]);

	useEffect(() => {
		if (editing) inputRef.current?.focus();
	}, [editing]);

	function commit() {
		setEditing(false);
		const next = draft.trim();
		if (next && next !== value) onSave(next);
		else setDraft(value);
	}

	if (!editing) {
		return (
			<button
				type="button"
				disabled={disabled}
				onClick={() => !disabled && setEditing(true)}
				className={cn(
					"-mx-1 w-full rounded px-1 text-left font-semibold text-foreground text-lg leading-snug",
					!disabled && "cursor-text hover:bg-accent/40",
				)}
			>
				{value}
			</button>
		);
	}

	return (
		<textarea
			ref={inputRef}
			value={draft}
			rows={2}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter" && !event.shiftKey) {
					event.preventDefault();
					commit();
				} else if (event.key === "Escape") {
					setDraft(value);
					setEditing(false);
				}
			}}
			className="w-full resize-none rounded border border-border/60 bg-background px-1 font-semibold text-foreground text-lg leading-snug outline-none focus:border-primary"
		/>
	);
}
