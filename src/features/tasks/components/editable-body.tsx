import { useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useRef, useState } from "react";
import { LazyStreamdown } from "@/components/streamdown-loader";
import { Button } from "@/components/ui/button";
import type { InboxItemDetailRef } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIssueEdit } from "../hooks/use-issue-edit";
import { ConflictBanner } from "./conflict-banner";

type Props = {
	body: string;
	updatedAt: string | null;
	detailRef: InboxItemDetailRef | null;
	detailQueryKey: readonly unknown[];
	editable: boolean;
	editSignal?: number;
};

const EMPTY_PLACEHOLDER = "No description provided.";

export function EditableBody({
	body,
	updatedAt,
	detailRef,
	detailQueryKey,
	editable,
	editSignal,
}: Props) {
	const queryClient = useQueryClient();
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(body);
	const snapshotRef = useRef<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const lastSignalRef = useRef<number | undefined>(editSignal);

	const editor = useIssueEdit({
		detailRef: detailRef ?? ({} as InboxItemDetailRef),
		detailQueryKey,
		field: "body",
		readField: (detail) => detail.body ?? "",
	});

	useEffect(() => {
		if (!isEditing) setDraft(body);
	}, [body, isEditing]);

	useEffect(() => {
		if (isEditing && textareaRef.current) {
			textareaRef.current.focus();
		}
	}, [isEditing]);

	useEffect(() => {
		if (editSignal === undefined) return;
		if (editSignal === lastSignalRef.current) return;
		lastSignalRef.current = editSignal;
		if (!editable || !detailRef) return;
		snapshotRef.current = updatedAt;
		setDraft(body);
		editor.clearError();
		editor.clearForce();
		setIsEditing(true);
	}, [editSignal, editable, detailRef, updatedAt, body, editor]);

	const cancel = () => {
		setIsEditing(false);
		setDraft(body);
		editor.clearError();
	};

	const submit = async () => {
		if (!detailRef) return;
		if (draft === body) {
			cancel();
			return;
		}
		const result = await editor.save({ body: draft }, snapshotRef.current);
		if (result) {
			setIsEditing(false);
		}
	};

	const rendered = body.trim() || EMPTY_PLACEHOLDER;

	if (!editable || !isEditing) {
		return (
			<div className="conversation-markdown break-words text-[13px] leading-6 text-foreground after:block after:h-24 after:content-['']">
				<Suspense
					fallback={
						<div className="conversation-streamdown whitespace-pre-wrap break-words">
							{rendered}
						</div>
					}
				>
					<LazyStreamdown className="conversation-streamdown" mode="static">
						{rendered}
					</LazyStreamdown>
				</Suspense>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
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
			<textarea
				ref={textareaRef}
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						cancel();
					} else if (
						(event.metaKey || event.ctrlKey) &&
						event.key === "Enter"
					) {
						event.preventDefault();
						void submit();
					}
				}}
				readOnly={editor.isSaving}
				placeholder="Write a description…"
				className={cn(
					"min-h-[12rem] w-full resize-y rounded-md border border-border/60 bg-background px-3 py-2 text-[13px] leading-6 outline-none focus:border-foreground/40",
					editor.isSaving && "opacity-70",
				)}
				style={{ fieldSizing: "content" } as React.CSSProperties}
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
					disabled={editor.isSaving}
					className="h-7 cursor-pointer"
				>
					{editor.isSaving ? "Saving…" : "Save"}
				</Button>
			</div>
		</div>
	);
}
