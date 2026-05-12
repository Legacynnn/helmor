import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CommentComposer({
	isSubmitting,
	error,
	onSubmit,
}: {
	isSubmitting: boolean;
	error: string | null;
	onSubmit: (body: string) => Promise<unknown>;
}) {
	const [draft, setDraft] = useState("");
	const trimmed = draft.trim();
	const disabled = isSubmitting || trimmed.length === 0;

	return (
		<form
			className="mt-3 flex flex-col gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				if (disabled) return;
				void onSubmit(trimmed).then(() => setDraft(""));
			}}
		>
			<textarea
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				placeholder="Write a comment…"
				rows={3}
				disabled={isSubmitting}
				onKeyDown={(event) => {
					if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
						event.preventDefault();
						if (disabled) return;
						void onSubmit(trimmed).then(() => setDraft(""));
					}
				}}
				className="min-h-[72px] w-full resize-y rounded-md border border-border/60 bg-background px-3 py-2 text-[13px] leading-5 outline-none focus:border-foreground/40"
			/>
			<div className="flex items-center justify-between gap-2">
				<span className="text-[11px] text-muted-foreground/80">
					{error ? (
						<span className="text-destructive">{error}</span>
					) : (
						<>Cmd/Ctrl+Enter to submit</>
					)}
				</span>
				<Button
					type="submit"
					size="sm"
					disabled={disabled}
					className="h-7 cursor-pointer"
				>
					{isSubmitting ? "Posting…" : "Comment"}
				</Button>
			</div>
		</form>
	);
}
