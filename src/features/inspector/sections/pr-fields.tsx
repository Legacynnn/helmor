import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	type ChangeRequestInfo,
	updateWorkspaceChangeRequest,
} from "@/lib/api";
import {
	helmorQueryKeys,
	workspaceForgeQueryOptions,
} from "@/lib/query-client";
import { cn } from "@/lib/utils";

interface PrFieldsProps {
	workspaceId: string | null;
	changeRequest: ChangeRequestInfo | null;
}

type Draft = { title: string; body: string };

const DRAFT_VERSION = 1;

function draftKey(workspaceId: string): string {
	return `helmor.workspace.${workspaceId}.prDraft.v${DRAFT_VERSION}`;
}

/** Load the locally-persisted draft for a workspace, or `null` if none/invalid. */
export function loadPrDraft(workspaceId: string): Draft | null {
	try {
		const raw = window.localStorage.getItem(draftKey(workspaceId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<Draft>;
		const title = typeof parsed.title === "string" ? parsed.title : "";
		const body = typeof parsed.body === "string" ? parsed.body : "";
		if (!title && !body) return null;
		return { title, body };
	} catch {
		return null;
	}
}

function savePrDraft(workspaceId: string, draft: Draft) {
	try {
		if (!draft.title && !draft.body) {
			window.localStorage.removeItem(draftKey(workspaceId));
			return;
		}
		window.localStorage.setItem(draftKey(workspaceId), JSON.stringify(draft));
	} catch {
		// localStorage failure is non-fatal — the user just loses the draft on
		// reload. No need to surface a toast for that.
	}
}

export function clearPrDraft(workspaceId: string) {
	try {
		window.localStorage.removeItem(draftKey(workspaceId));
	} catch {
		// non-fatal
	}
}

/**
 * Two ghost inputs (PR title, description) shown at the top of the Checks
 * panel. Enter saves. Pre-PR: persisted to localStorage as the seed for the
 * eventual `gh pr create`. Open-PR: edits push to the live PR via
 * `updateWorkspaceChangeRequest`. Hidden on GitLab — the Rust backend doesn't
 * support MR title/body edits yet.
 */
export function PrFields({ workspaceId, changeRequest }: PrFieldsProps) {
	const queryClient = useQueryClient();
	const forgeQuery = useQuery({
		...workspaceForgeQueryOptions(workspaceId ?? "__none__"),
		enabled: workspaceId !== null,
	});
	const provider = forgeQuery.data?.provider;

	const isOpenPr =
		changeRequest != null &&
		changeRequest.state === "OPEN" &&
		!changeRequest.isMerged;

	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	// Track the last value the server / draft confirmed so blur-without-save
	// can revert silently and Enter knows whether it has anything to do.
	const savedRef = useRef<{ title: string; body: string }>({
		title: "",
		body: "",
	});
	const [savingField, setSavingField] = useState<"title" | "body" | null>(null);

	// Sync inputs from the source of truth (live PR or local draft) whenever
	// the workspace, the PR, or the open/draft state flips.
	useEffect(() => {
		let nextTitle = "";
		let nextBody = "";
		if (isOpenPr && changeRequest) {
			nextTitle = changeRequest.title;
			nextBody = changeRequest.body ?? "";
			// Once the PR exists, the local draft is no longer the source of
			// truth. Drop it so a future closed/reopen cycle doesn't resurrect
			// stale text.
			if (workspaceId) clearPrDraft(workspaceId);
		} else if (workspaceId) {
			const draft = loadPrDraft(workspaceId);
			if (draft) {
				nextTitle = draft.title;
				nextBody = draft.body;
			}
		}
		setTitle(nextTitle);
		setBody(nextBody);
		savedRef.current = { title: nextTitle, body: nextBody };
	}, [isOpenPr, changeRequest, workspaceId]);

	const commitField = useCallback(
		async (field: "title" | "body") => {
			if (!workspaceId) return;
			const value = field === "title" ? title : body;
			const lastSaved =
				field === "title" ? savedRef.current.title : savedRef.current.body;
			if (value === lastSaved) return;

			if (!isOpenPr) {
				// Pre-PR draft — persist locally, no network call.
				const nextDraft: Draft = { title, body };
				savePrDraft(workspaceId, nextDraft);
				savedRef.current = nextDraft;
				return;
			}

			setSavingField(field);
			try {
				const result = await updateWorkspaceChangeRequest(workspaceId, {
					[field]: value,
				});
				if (result) {
					savedRef.current = {
						title: result.title,
						body: result.body ?? "",
					};
					setTitle(result.title);
					setBody(result.body ?? "");
				} else {
					savedRef.current = { ...savedRef.current, [field]: value };
				}
				queryClient.invalidateQueries({
					queryKey: helmorQueryKeys.workspaceChangeRequest(workspaceId),
				});
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: `Unable to update PR ${field}.`;
				toast.error(message);
				// Revert the input to the last saved value on failure.
				if (field === "title") setTitle(savedRef.current.title);
				else setBody(savedRef.current.body);
			} finally {
				setSavingField(null);
			}
		},
		[workspaceId, isOpenPr, title, body, queryClient],
	);

	const handleKeyDown = useCallback(
		(field: "title" | "body") => (event: KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void commitField(field);
			} else if (event.key === "Escape") {
				event.preventDefault();
				if (field === "title") setTitle(savedRef.current.title);
				else setBody(savedRef.current.body);
				event.currentTarget.blur();
			}
		},
		[commitField],
	);

	const handleBlur = useCallback(
		(field: "title" | "body") => () => {
			// Per spec: silent drop on blur-without-Enter. Just snap back to
			// the last saved value so the input doesn't leave dirty text on
			// screen that the user thinks was saved.
			if (field === "title") setTitle(savedRef.current.title);
			else setBody(savedRef.current.body);
		},
		[],
	);

	if (!workspaceId) return null;
	// GitLab: backend update path isn't implemented yet — hiding the entire
	// block keeps the panel usable instead of shipping an input that errors.
	if (provider === "gitlab") return null;

	return (
		<div className="flex flex-col gap-1 px-2.5 pb-2 pt-2.5">
			<input
				type="text"
				value={title}
				placeholder="PR name"
				onChange={(e) => setTitle(e.target.value)}
				onKeyDown={handleKeyDown("title")}
				onBlur={handleBlur("title")}
				disabled={savingField === "title"}
				aria-label="PR title"
				className={cn(
					"w-full bg-transparent text-[13px] font-medium text-foreground placeholder:text-muted-foreground/70",
					"border-0 border-b border-transparent px-0 py-0.5 outline-none",
					"focus:border-border focus:ring-0",
					"disabled:opacity-50",
				)}
			/>
			<input
				type="text"
				value={body}
				placeholder="Description"
				onChange={(e) => setBody(e.target.value)}
				onKeyDown={handleKeyDown("body")}
				onBlur={handleBlur("body")}
				disabled={savingField === "body"}
				aria-label="PR description"
				className={cn(
					"w-full bg-transparent text-[12px] text-muted-foreground placeholder:text-muted-foreground/60",
					"border-0 border-b border-transparent px-0 py-0.5 outline-none",
					"focus:border-border focus:ring-0",
					"disabled:opacity-50",
				)}
			/>
		</div>
	);
}
