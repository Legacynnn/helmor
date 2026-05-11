import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { InboxItemDetailRef } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIssueEdit } from "../hooks/use-issue-edit";
import { ConflictBanner } from "./conflict-banner";

type Props = {
	title: string;
	updatedAt: string | null;
	detailRef: InboxItemDetailRef | null;
	detailQueryKey: readonly unknown[];
	editable: boolean;
	editSignal?: number;
};

export function EditableTitle({
	title,
	updatedAt,
	detailRef,
	detailQueryKey,
	editable,
	editSignal,
}: Props) {
	const queryClient = useQueryClient();
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(title);
	const snapshotRef = useRef<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const lastSignalRef = useRef<number | undefined>(editSignal);

	const editor = useIssueEdit({
		detailRef: detailRef ?? ({} as InboxItemDetailRef),
		detailQueryKey,
		field: "title",
		readField: (detail) => detail.title,
	});

	useEffect(() => {
		if (!isEditing) setDraft(title);
	}, [title, isEditing]);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	useEffect(() => {
		if (editSignal === undefined) return;
		if (editSignal === lastSignalRef.current) return;
		lastSignalRef.current = editSignal;
		if (!editable || !detailRef) return;
		snapshotRef.current = updatedAt;
		setDraft(title);
		editor.clearError();
		editor.clearForce();
		setIsEditing(true);
	}, [editSignal, editable, detailRef, updatedAt, title, editor]);

	const cancel = () => {
		setIsEditing(false);
		setDraft(title);
		editor.clearError();
	};

	const trimmed = draft.trim();
	const disabled = trimmed.length === 0 || trimmed === title.trim();

	const submit = async () => {
		if (disabled || !detailRef) return;
		const result = await editor.save({ title: trimmed }, snapshotRef.current);
		if (result) {
			setIsEditing(false);
		}
	};

	if (!editable || !isEditing) {
		return (
			<div className="mt-2">
				<h1 className="min-w-0 text-base font-medium">{title}</h1>
			</div>
		);
	}

	return (
		<div className="mt-2 flex flex-col gap-2">
			{editor.conflict ? (
				<ConflictBanner
					conflict={editor.conflict}
					onReload={() => {
						editor.dismissConflict();
						void queryClient.invalidateQueries({ queryKey: detailQueryKey });
						cancel();
					}}
					onOverwrite={() => {
						editor.overwriteNext();
						void submit();
					}}
					onDismiss={editor.dismissConflict}
				/>
			) : null}
			<input
				ref={inputRef}
				type="text"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						cancel();
					} else if (
						event.key === "Enter" ||
						((event.metaKey || event.ctrlKey) && event.key === "Enter")
					) {
						event.preventDefault();
						void submit();
					}
				}}
				readOnly={editor.isSaving}
				className={cn(
					"w-full rounded-md border border-border/60 bg-background px-3 py-1.5 text-base font-medium outline-none focus:border-foreground/40",
					editor.isSaving && "opacity-70",
				)}
				placeholder="Issue title"
			/>
			<div className="flex items-center justify-end gap-2">
				{editor.error ? (
					<span className="mr-auto text-[12px] text-destructive">
						{editor.error}
					</span>
				) : null}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={cancel}
					disabled={editor.isSaving}
					className="h-7 cursor-pointer"
				>
					Cancel
				</Button>
				<Button
					type="button"
					size="sm"
					onClick={() => void submit()}
					disabled={disabled || editor.isSaving}
					className="h-7 cursor-pointer"
				>
					{editor.isSaving ? "Saving…" : "Save"}
				</Button>
			</div>
		</div>
	);
}
