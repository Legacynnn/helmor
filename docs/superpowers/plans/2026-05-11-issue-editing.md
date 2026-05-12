# GitHub Issue Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit GitHub issue title, body, and open/closed state inline from the tasks detail screen, with optimistic updates and conflict detection.

**Architecture:** A new Rust module exposes `update_github_issue` (PATCH `/repos/:owner/:repo/issues/:number` via `gh api`). The frontend swaps the read-only title/body into editors on hover-pencil click, manages per-surface edit state locally, snapshots `updated_at` on edit-start, refetches before save to detect remote drift, and writes the PATCH response into the React Query cache for instant render.

**Tech Stack:** Rust + Tauri (commands), React + TanStack Query + Tailwind (UI), `gh` CLI for the REST call.

**Spec:** `docs/superpowers/specs/2026-05-11-issue-editing-design.md`

**Conventions:** Project disallows commits without explicit user ask — show commit commands in tasks but the user/executor decides when to run them. No TDD: the `forge/github/*.rs` family and `features/tasks/components/*.tsx` have no existing tests; verification is `bun run typecheck` + `cargo clippy --all-targets -- -D warnings` + manual Tauri MCP run.

---

## File Structure

**Create:**
- `src-tauri/src/forge/github/issue_edit.rs` — PATCH endpoint logic.
- `src/features/tasks/components/editable-title.tsx` — title editor.
- `src/features/tasks/components/editable-body.tsx` — body editor.
- `src/features/tasks/components/status-badge-menu.tsx` — status badge dropdown.
- `src/features/tasks/components/conflict-banner.tsx` — staleness banner.
- `src/features/tasks/hooks/use-issue-edit.ts` — shared save-flow hook (refetch → staleness check → PATCH → cache write).

**Modify:**
- `src-tauri/src/forge/github/mod.rs` — declare module, re-export.
- `src-tauri/src/forge/github/inbox.rs` — expose `IssueRestResponse`, `PullRequestRestUser`, `GithubRestLabel`, `parse_external_reference` as `pub(super)`; extract `issue_detail_from_rest` helper.
- `src-tauri/src/commands/forge_commands.rs` — `update_github_issue` Tauri command.
- `src-tauri/src/lib.rs` — register command.
- `src/lib/api.ts` — `IssueUpdate` type, `updateGithubIssue` wrapper.
- `src/features/tasks/components/detail-screen.tsx` — mount editors + dropdown + banner behind `item.source === "github-issue"` gate.

---

### Task 1: Backend — refactor `inbox.rs` to share the issue REST mapping

**Files:**
- Modify: `src-tauri/src/forge/github/inbox.rs`

- [ ] **Step 1: Expose the REST response structs to the github module**

In `src-tauri/src/forge/github/inbox.rs`, change visibility on these struct declarations:

```rust
#[derive(Debug, Deserialize)]
pub(super) struct IssueRestResponse {
    pub node_id: String,
    pub html_url: String,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub state_reason: Option<String>,
    pub user: Option<PullRequestRestUser>,
    #[serde(default)]
    pub assignees: Vec<PullRequestRestUser>,
    #[serde(default)]
    pub labels: Vec<GithubRestLabel>,
    pub pull_request: Option<serde_json::Value>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct PullRequestRestUser {
    pub login: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct GithubRestLabel {
    pub name: String,
}
```

(Other private fields on these structs that are unused outside the module can stay private — but since they were tuple-style with private fields, just promote the visibility on each field used downstream. The mapping helper below uses `title`, `body`, `html_url`, `state`, `state_reason`, `user.login`, `created_at`, `updated_at`, `closed_at`.)

- [ ] **Step 2: Extract `issue_detail_from_rest` helper**

In the same file, add the helper just below the `IssueRestResponse` struct:

```rust
pub(super) fn issue_detail_from_rest(
    response: IssueRestResponse,
    external_id: &str,
) -> GithubIssueDetail {
    GithubIssueDetail {
        external_id: external_id.to_string(),
        title: response.title,
        body: response.body,
        url: response.html_url,
        state: response.state,
        state_reason: response.state_reason,
        author_login: response.user.map(|user| user.login),
        created_at: response.created_at,
        updated_at: response.updated_at,
        closed_at: response.closed_at,
    }
}
```

- [ ] **Step 3: Replace the inlined mapping in `fetch_issue_detail`**

Find `fetch_issue_detail` (around line 647) and replace its `Ok(Some(InboxItemDetail::GithubIssue(Box::new(GithubIssueDetail { … }))))` block with a call to the new helper:

```rust
fn fetch_issue_detail(login: &str, external_id: &str) -> Result<Option<InboxItemDetail>> {
    let (owner, repo, number) = parse_external_reference(external_id)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}");
    let Some(stdout) = run_github_api(login, &path, "GitHub issue detail")? else {
        return Ok(None);
    };
    let response = serde_json::from_str::<IssueRestResponse>(&stdout)
        .with_context(|| "Failed to decode GitHub issue detail response".to_string())?;
    Ok(Some(InboxItemDetail::GithubIssue(Box::new(
        issue_detail_from_rest(response, external_id),
    ))))
}
```

- [ ] **Step 4: Verify the refactor compiles**

```
cargo clippy --all-targets -- -D warnings
```

Expected: zero warnings, clean compile. If you see "field is never read" warnings on `node_id` or `pull_request`, leave those — they're consumed elsewhere or by serde for round-tripping.

- [ ] **Step 5: Commit (when ready)**

```
git add src-tauri/src/forge/github/inbox.rs
git commit -m "refactor(github): share issue REST→detail mapping"
```

---

### Task 2: Backend — create `issue_edit.rs` with `update_issue`

**Files:**
- Create: `src-tauri/src/forge/github/issue_edit.rs`

- [ ] **Step 1: Create the new module file**

Create `src-tauri/src/forge/github/issue_edit.rs` with the following content:

```rust
//! GitHub issue editing — PATCH /repos/:owner/:repo/issues/:number.
//! Used by the tasks detail screen so users can edit title, body, and
//! open/closed state inline. Only fields present in `IssueUpdate` are
//! sent to GitHub; `None` fields are omitted entirely so a body-only
//! edit can't blank the title.
//!
//! REST is used over GraphQL here because the GraphQL mutation needs
//! the issue node ID (extra round-trip) while REST accepts the human
//! number directly and returns the refreshed issue in one call.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

use super::accounts as gh_accounts;
use super::api::{looks_like_auth_rejection, GITHUB_HOST};
use super::inbox::{
    issue_detail_from_rest, parse_external_reference, IssueRestResponse,
};
use crate::forge::command::command_detail;
use crate::forge::github::inbox::detail::GithubIssueDetail;

/// Subset of GitHub issue fields editable from the detail screen. Each
/// field is `Option<String>` so callers can patch one field at a time
/// without touching the others.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueUpdate {
    pub title: Option<String>,
    pub body: Option<String>,
    /// `"open"` or `"closed"`. Validated by GitHub.
    pub state: Option<String>,
    /// `"completed"`, `"not_planned"`, or `"reopened"`. Only meaningful
    /// when `state` is present.
    pub state_reason: Option<String>,
}

impl IssueUpdate {
    fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.body.is_none()
            && self.state.is_none()
            && self.state_reason.is_none()
    }
}

/// Patch a GitHub issue. Returns the refreshed `GithubIssueDetail` so
/// the frontend can write it into the React Query cache without a
/// follow-up GET.
pub fn update_issue(
    login: &str,
    external_id: &str,
    update: IssueUpdate,
) -> Result<GithubIssueDetail> {
    if update.is_empty() {
        return Err(anyhow!("No fields to update"));
    }
    let (owner, repo, number) = parse_external_reference(external_id)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}");

    let mut args: Vec<String> = vec![
        "api".to_string(),
        "--hostname".to_string(),
        GITHUB_HOST.to_string(),
        "-H".to_string(),
        "Accept: application/vnd.github+json".to_string(),
        "-X".to_string(),
        "PATCH".to_string(),
        path,
    ];

    if let Some(title) = update.title.as_deref() {
        args.push("-f".to_string());
        args.push(format!("title={title}"));
    }
    if let Some(body) = update.body.as_deref() {
        args.push("-f".to_string());
        args.push(format!("body={body}"));
    }
    if let Some(state) = update.state.as_deref() {
        args.push("-f".to_string());
        args.push(format!("state={state}"));
    }
    if let Some(state_reason) = update.state_reason.as_deref() {
        args.push("-f".to_string());
        args.push(format!("state_reason={state_reason}"));
    }

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = match gh_accounts::run_cli_with_login(GITHUB_HOST, login, &arg_refs) {
        Ok(output) => output,
        Err(error) => {
            let message = format!("{error:#}");
            if looks_like_auth_rejection(&message) {
                return Err(anyhow!(
                    "GitHub authentication is required to edit this issue"
                ));
            }
            return Err(error.context("Failed to spawn `gh api` for issue update"));
        }
    };

    if !output.success {
        let detail = command_detail(&output);
        if looks_like_auth_rejection(&detail) {
            return Err(anyhow!(
                "GitHub authentication is required to edit this issue"
            ));
        }
        return Err(anyhow!("`gh api` failed updating issue: {detail}"));
    }

    let response: IssueRestResponse = serde_json::from_str(&output.stdout)
        .with_context(|| "Failed to decode updated GitHub issue response".to_string())?;
    Ok(issue_detail_from_rest(response, external_id))
}
```

- [ ] **Step 2: Declare the module and re-export from `forge/github/mod.rs`**

In `src-tauri/src/forge/github/mod.rs`, find the existing module declarations near the top and add `issue_edit`:

```rust
mod comments;
mod context;
pub mod inbox;
mod issue_comments;
mod issue_edit;
pub mod lists;
mod pull_request;
mod types;

pub use issue_comments::{create_issue_comment, list_issue_comments};
pub use issue_edit::{update_issue, IssueUpdate};
```

- [ ] **Step 3: Verify the new module compiles**

```
cargo clippy --all-targets -- -D warnings
```

Expected: clean. If you see "unused import" on `IssueRestResponse` because the only caller is `update_issue`, that's expected to disappear once Task 3 wires the Tauri command.

- [ ] **Step 4: Commit (when ready)**

```
git add src-tauri/src/forge/github/issue_edit.rs src-tauri/src/forge/github/mod.rs
git commit -m "feat(github): add update_issue PATCH endpoint"
```

---

### Task 3: Backend — wire the `update_github_issue` Tauri command

**Files:**
- Modify: `src-tauri/src/commands/forge_commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the command in `forge_commands.rs`**

Open `src-tauri/src/commands/forge_commands.rs`. At the top of the file find the `use crate::forge::{…}` block. It currently imports `PrCommentInfo`. We also need `IssueUpdate` and `InboxItemDetail`. `InboxItemDetail` is already imported. Add `IssueUpdate` from the github sub-module:

At the top of the file (after the existing `use crate::forge::{…}` block), add:

```rust
use crate::forge::github::IssueUpdate;
use crate::forge::github::inbox::detail::GithubIssueDetail;
```

(If `detail` is not `pub` on the inbox module, check `src-tauri/src/forge/github/inbox.rs` — it should already be `pub mod detail;` at line ~27. If not, change it. Verify with `cargo clippy` after.)

Now find the `create_github_issue_comment` command we added previously. Just after it (before `get_workspace_account_profile`), add the new command:

```rust
/// PATCH a GitHub issue. Returns the refreshed issue detail so the
/// caller can write it into the React Query cache without a follow-up
/// GET. Only fields present in `update` are sent to GitHub.
#[tauri::command]
pub async fn update_github_issue(
    login: String,
    external_id: String,
    update: IssueUpdate,
) -> CmdResult<GithubIssueDetail> {
    run_blocking(move || forge::github::update_issue(&login, &external_id, update)).await
}
```

- [ ] **Step 2: Register the command in `lib.rs`**

Open `src-tauri/src/lib.rs`. Find the `invoke_handler` block where `create_github_issue_comment` is registered (around line 346). Add `update_github_issue` directly below it:

```rust
            commands::forge_commands::list_github_issue_comments,
            commands::forge_commands::create_github_issue_comment,
            commands::forge_commands::update_github_issue,
            commands::forge_commands::get_workspace_account_profile,
```

- [ ] **Step 3: Verify the backend builds end-to-end**

```
cargo clippy --all-targets -- -D warnings
```

Expected: clean compile, zero warnings.

- [ ] **Step 4: Commit (when ready)**

```
git add src-tauri/src/commands/forge_commands.rs src-tauri/src/lib.rs
git commit -m "feat(github): expose update_github_issue Tauri command"
```

---

### Task 4: Frontend — add `IssueUpdate` type and `updateGithubIssue` wrapper

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add the type and wrapper**

Open `src/lib/api.ts`. Find the `createGithubIssueComment` function added previously. Directly below it (before `listWorkspaceCommitsAhead`), add:

```ts
export type IssueUpdate = {
	title?: string;
	body?: string;
	state?: "open" | "closed";
	stateReason?: "completed" | "not_planned" | "reopened";
};

export async function updateGithubIssue(
	login: string,
	externalId: string,
	update: IssueUpdate,
): Promise<GitHubIssueDetail> {
	try {
		return await invoke<GitHubIssueDetail>("update_github_issue", {
			login,
			externalId,
			update,
		});
	} catch (error) {
		throw new Error(describeInvokeError(error, "Unable to update issue."));
	}
}
```

Note the Rust struct uses `#[serde(rename_all = "camelCase")]`, so `stateReason` on the TS side maps to `state_reason` on the wire — Tauri's invoke serializer handles the outer wrapping; the inner `update` object is passed as-is. Verify that the Rust `IssueUpdate` struct in Task 2 has `#[serde(rename_all = "camelCase")]` — it does.

- [ ] **Step 2: Verify typecheck**

```
bun run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit (when ready)**

```
git add src/lib/api.ts
git commit -m "feat(api): add updateGithubIssue wrapper"
```

---

### Task 5: Frontend — create the shared `useIssueEdit` hook

**Files:**
- Create: `src/features/tasks/hooks/use-issue-edit.ts`

- [ ] **Step 1: Create the hook file**

Create `src/features/tasks/hooks/use-issue-edit.ts`:

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
	getInboxItemDetail,
	type GitHubIssueDetail,
	type InboxItemDetail,
	type InboxItemDetailRef,
	type IssueUpdate,
	updateGithubIssue,
} from "@/lib/api";

type FieldKey = "title" | "body" | "state";

export type IssueEditConflict = {
	field: FieldKey;
	remoteValue: string;
	remoteUpdatedAt: string | null;
};

export type IssueEditOptions = {
	detailRef: InboxItemDetailRef;
	detailQueryKey: readonly unknown[];
	field: FieldKey;
	/**
	 * Returns the remote value of the field on a detail snapshot — used to
	 * decide whether a remote drift actually conflicts with the field
	 * being edited.
	 */
	readField: (detail: GitHubIssueDetail) => string;
};

/**
 * Encapsulates the per-surface save flow:
 *   1. refetch detail (bypassing staleTime),
 *   2. compare `updated_at` against the snapshot captured at edit-start,
 *   3. if drifted AND the field-we're-editing changed remotely → expose
 *      a conflict the caller renders; otherwise PATCH and write the
 *      response into the cache.
 *
 * The hook is stateless about which field is being edited at the UI
 * level — the consumer owns `draft` + `isEditing`. The hook only owns
 * the save mechanics and the conflict signal.
 */
export function useIssueEdit({
	detailRef,
	detailQueryKey,
	field,
	readField,
}: IssueEditOptions) {
	const queryClient = useQueryClient();
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [conflict, setConflict] = useState<IssueEditConflict | null>(null);
	const forceOverwriteRef = useRef(false);

	const clearForce = useCallback(() => {
		forceOverwriteRef.current = false;
	}, []);

	const save = useCallback(
		async (
			update: IssueUpdate,
			snapshotUpdatedAt: string | null,
		): Promise<GitHubIssueDetail | null> => {
			setIsSaving(true);
			setError(null);
			try {
				if (!forceOverwriteRef.current) {
					const refreshed = (await queryClient.fetchQuery({
						queryKey: detailQueryKey,
						queryFn: () => getInboxItemDetail(detailRef),
					})) as InboxItemDetail | null;
					if (refreshed && refreshed.type === "github_issue") {
						const remote = refreshed.data;
						if (
							(remote.updatedAt ?? null) !== (snapshotUpdatedAt ?? null) &&
							readField(remote) !== getDraftBaseline(update, field)
						) {
							setConflict({
								field,
								remoteValue: readField(remote),
								remoteUpdatedAt: remote.updatedAt ?? null,
							});
							return null;
						}
					}
				}

				const result = await updateGithubIssue(
					detailRef.login,
					detailRef.externalId,
					update,
				);
				queryClient.setQueryData<InboxItemDetail | null>(detailQueryKey, {
					type: "github_issue",
					data: result,
				});
				void queryClient.invalidateQueries({ queryKey: ["tasks"] });
				setConflict(null);
				forceOverwriteRef.current = false;
				return result;
			} catch (caught) {
				setError(
					caught instanceof Error ? caught.message : String(caught),
				);
				return null;
			} finally {
				setIsSaving(false);
			}
		},
		[detailQueryKey, detailRef, field, queryClient, readField],
	);

	return {
		isSaving,
		error,
		conflict,
		dismissConflict: () => setConflict(null),
		overwriteNext: () => {
			forceOverwriteRef.current = true;
			setConflict(null);
		},
		clearForce,
		clearError: () => setError(null),
		save,
	};
}

/**
 * Best-effort: the "baseline" for the field we're editing is what the
 * user thought the remote value was when they hit Save. We approximate
 * with the inverse of the update — `update[field]` is what they're
 * proposing, so the baseline is anything-else. In practice the staleness
 * check only fires for the field actually being PATCHed.
 */
function getDraftBaseline(update: IssueUpdate, field: FieldKey): string {
	// If the user did not include this field in `update`, we did not edit
	// it — so any remote value is "no conflict".
	if (field === "title") return update.title ?? "";
	if (field === "body") return update.body ?? "";
	if (field === "state") return update.state ?? "";
	return "";
}
```

Note: the conflict heuristic compares remote field to the *proposed* new value rather than the original baseline. This means: if the remote also changed but to the exact same value the user is proposing, we silently proceed (it's not a real conflict). Acceptable for v1; documented behavior.

- [ ] **Step 2: Verify typecheck**

```
bun run typecheck
```

Expected: clean. If `IssueUpdate` import fails, double-check the export from `src/lib/api.ts` in Task 4.

- [ ] **Step 3: Commit (when ready)**

```
git add src/features/tasks/hooks/use-issue-edit.ts
git commit -m "feat(tasks): add useIssueEdit hook for save-flow + staleness"
```

---

### Task 6: Frontend — build `EditableTitle`

**Files:**
- Create: `src/features/tasks/components/editable-title.tsx`

- [ ] **Step 1: Create the component**

Create `src/features/tasks/components/editable-title.tsx`:

```tsx
import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { InboxItemDetailRef } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIssueEdit } from "../hooks/use-issue-edit";

type Props = {
	title: string;
	updatedAt: string | null;
	detailRef: InboxItemDetailRef | null;
	detailQueryKey: readonly unknown[];
	editable: boolean;
};

export function EditableTitle({
	title,
	updatedAt,
	detailRef,
	detailQueryKey,
	editable,
}: Props) {
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(title);
	const snapshotRef = useRef<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

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

	const startEdit = () => {
		if (!editable || !detailRef) return;
		snapshotRef.current = updatedAt;
		setDraft(title);
		editor.clearError();
		editor.clearForce();
		setIsEditing(true);
	};

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
			<div className="group/title relative mt-2 flex items-start gap-2">
				<h1 className="min-w-0 flex-1 text-base font-medium">{title}</h1>
				{editable ? (
					<button
						type="button"
						aria-label="Edit title"
						onClick={startEdit}
						className="mt-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover/title:opacity-100"
					>
						<Pencil className="size-[13px]" strokeWidth={1.8} />
					</button>
				) : null}
			</div>
		);
	}

	return (
		<div className="mt-2 flex flex-col gap-2">
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
```

Note: this component instantiates `useIssueEdit` even when not editable so hook order is stable. The hook ignores `detailRef` until `save` is called, so the empty-object cast is safe in practice — but if you'd rather, gate the early `if (!editable)` return *after* the hook call. The current order is fine.

- [ ] **Step 2: Verify typecheck**

```
bun run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit (when ready)**

```
git add src/features/tasks/components/editable-title.tsx
git commit -m "feat(tasks): add EditableTitle component"
```

---

### Task 7: Frontend — build `EditableBody`

**Files:**
- Create: `src/features/tasks/components/editable-body.tsx`

- [ ] **Step 1: Create the component**

Create `src/features/tasks/components/editable-body.tsx`:

```tsx
import { Pencil } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { LazyStreamdown } from "@/components/streamdown-loader";
import { Button } from "@/components/ui/button";
import type { InboxItemDetailRef } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIssueEdit } from "../hooks/use-issue-edit";

type Props = {
	body: string;
	updatedAt: string | null;
	detailRef: InboxItemDetailRef | null;
	detailQueryKey: readonly unknown[];
	editable: boolean;
};

const EMPTY_PLACEHOLDER = "No description provided.";

export function EditableBody({
	body,
	updatedAt,
	detailRef,
	detailQueryKey,
	editable,
}: Props) {
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(body);
	const snapshotRef = useRef<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

	const startEdit = () => {
		if (!editable || !detailRef) return;
		snapshotRef.current = updatedAt;
		setDraft(body);
		editor.clearError();
		editor.clearForce();
		setIsEditing(true);
	};

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
			<div className="group/body relative">
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
				{editable ? (
					<button
						type="button"
						aria-label="Edit description"
						onClick={startEdit}
						className="absolute right-0 top-0 inline-flex size-7 cursor-pointer items-center justify-center rounded-md bg-background/80 text-muted-foreground/60 opacity-0 backdrop-blur-sm transition-opacity hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover/body:opacity-100"
					>
						<Pencil className="size-[14px]" strokeWidth={1.8} />
					</button>
				) : null}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
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
```

- [ ] **Step 2: Verify typecheck**

```
bun run typecheck
```

Expected: clean. (`field-sizing` may need a cast — it's already cast via `as React.CSSProperties` to satisfy TS for the experimental CSS prop.)

- [ ] **Step 3: Commit (when ready)**

```
git add src/features/tasks/components/editable-body.tsx
git commit -m "feat(tasks): add EditableBody component"
```

---

### Task 8: Frontend — build `StatusBadgeMenu`

**Files:**
- Create: `src/features/tasks/components/status-badge-menu.tsx`

- [ ] **Step 1: Create the component**

Create `src/features/tasks/components/status-badge-menu.tsx`:

```tsx
import { CheckCircle2, CircleSlash, RotateCw } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { InboxItemDetailRef } from "@/lib/api";
import type { TaskListItem } from "../types";
import { useIssueEdit } from "../hooks/use-issue-edit";

type Props = {
	status: TaskListItem["status"];
	state: string;
	updatedAt: string | null;
	detailRef: InboxItemDetailRef | null;
	detailQueryKey: readonly unknown[];
	editable: boolean;
};

export function StatusBadgeMenu({
	status,
	state,
	updatedAt,
	detailRef,
	detailQueryKey,
	editable,
}: Props) {
	const editor = useIssueEdit({
		detailRef: detailRef ?? ({} as InboxItemDetailRef),
		detailQueryKey,
		field: "state",
		readField: (detail) => detail.state,
	});

	const badge = (
		<span
			className="rounded-full border px-2 py-0.5 text-[12px] font-semibold transition-shadow"
			style={{
				color: status.color,
				borderColor: `color-mix(in oklab, ${status.color} 35%, transparent)`,
				backgroundImage: `linear-gradient(135deg, color-mix(in oklab, ${status.color} 28%, transparent), color-mix(in oklab, ${status.color} 8%, transparent))`,
			}}
		>
			{status.label}
		</span>
	);

	if (!editable || !detailRef) {
		return badge;
	}

	const isOpen = state.toLowerCase() === "open";

	const close = (reason: "completed" | "not_planned") =>
		void editor.save(
			{ state: "closed", stateReason: reason },
			updatedAt,
		);

	const reopen = () =>
		void editor.save(
			{ state: "open", stateReason: "reopened" },
			updatedAt,
		);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Change issue state"
					disabled={editor.isSaving}
					className="cursor-pointer rounded-full outline-none ring-foreground/15 transition-shadow hover:ring-1 focus-visible:ring-2"
				>
					{badge}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-[12rem]">
				{isOpen ? (
					<>
						<DropdownMenuItem
							onSelect={() => close("completed")}
							className="cursor-pointer gap-2"
						>
							<CheckCircle2 className="size-[14px] text-emerald-500" />
							Close as completed
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => close("not_planned")}
							className="cursor-pointer gap-2"
						>
							<CircleSlash className="size-[14px] text-muted-foreground" />
							Close as not planned
						</DropdownMenuItem>
					</>
				) : (
					<DropdownMenuItem
						onSelect={reopen}
						className="cursor-pointer gap-2"
					>
						<RotateCw className="size-[14px] text-emerald-500" />
						Reopen issue
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```

- [ ] **Step 2: Confirm DropdownMenu primitives exist**

Check that `src/components/ui/dropdown-menu.tsx` exists and exports `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`. The codebase uses shadcn/ui base-nova so it should — verify:

```
ls src/components/ui/dropdown-menu.tsx
```

Expected: file exists. If not, the project uses a different naming convention — search for the primitive in `src/components/ui/` and adjust the imports.

- [ ] **Step 3: Verify typecheck**

```
bun run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit (when ready)**

```
git add src/features/tasks/components/status-badge-menu.tsx
git commit -m "feat(tasks): add StatusBadgeMenu dropdown"
```

---

### Task 9: Frontend — build `ConflictBanner`

**Files:**
- Create: `src/features/tasks/components/conflict-banner.tsx`

- [ ] **Step 1: Create the component**

Create `src/features/tasks/components/conflict-banner.tsx`:

```tsx
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IssueEditConflict } from "../hooks/use-issue-edit";

type Props = {
	conflict: IssueEditConflict;
	onReload: () => void;
	onOverwrite: () => void;
	onDismiss: () => void;
};

function relativeShort(iso: string | null): string {
	if (!iso) return "recently";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "recently";
	const diff = Math.max(0, Date.now() - date.getTime());
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

const FIELD_LABEL: Record<IssueEditConflict["field"], string> = {
	title: "title",
	body: "description",
	state: "state",
};

export function ConflictBanner({
	conflict,
	onReload,
	onOverwrite,
	onDismiss,
}: Props) {
	return (
		<div
			role="alert"
			className="mb-3 flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-200"
		>
			<AlertTriangle className="mt-0.5 size-[14px] shrink-0" strokeWidth={1.8} />
			<div className="min-w-0 flex-1">
				<p className="font-medium">
					The {FIELD_LABEL[conflict.field]} was changed on GitHub{" "}
					{relativeShort(conflict.remoteUpdatedAt)}.
				</p>
				<p className="mt-0.5 text-amber-200/80">
					Your changes haven't been saved. Reload to see the latest version, or
					overwrite to save yours.
				</p>
				<div className="mt-2 flex items-center gap-2">
					<Button
						type="button"
						size="sm"
						onClick={onReload}
						className="h-7 cursor-pointer"
					>
						Reload
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onOverwrite}
						className="h-7 cursor-pointer"
					>
						Overwrite
					</Button>
				</div>
			</div>
			<button
				type="button"
				aria-label="Dismiss"
				onClick={onDismiss}
				className="cursor-pointer text-amber-200/70 hover:text-amber-200"
			>
				<X className="size-[14px]" strokeWidth={1.8} />
			</button>
		</div>
	);
}
```

- [ ] **Step 2: Verify typecheck**

```
bun run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit (when ready)**

```
git add src/features/tasks/components/conflict-banner.tsx
git commit -m "feat(tasks): add ConflictBanner component"
```

---

### Task 10: Frontend — wire all components into `detail-screen.tsx`

**Files:**
- Modify: `src/features/tasks/components/detail-screen.tsx`

- [ ] **Step 1: Update imports**

Open `src/features/tasks/components/detail-screen.tsx`. Replace the existing import block at the top with:

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, Check, Clock3, Copy, ExternalLink } from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { LazyStreamdown } from "@/components/streamdown-loader";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	getInboxItemDetail,
	type InboxItemDetail,
	type InboxItemDetailRef,
	type LinearIssueDetail,
	linearGetTask,
	type RepositoryCreateOption,
	tasksFindWorkspaceForLinearTask,
	tasksFindWorkspaceForPrUrl,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TaskListItem } from "../types";
import { ConflictBanner } from "./conflict-banner";
import { EditableBody } from "./editable-body";
import { EditableTitle } from "./editable-title";
import { IssueComments } from "./issue-comments";
import { StatusBadgeMenu } from "./status-badge-menu";
```

(You can drop the `LazyStreamdown` + `Suspense` imports if the `MarkdownBody` helper is no longer used — but `MarkdownBody` is still used in the non-issue branch, so keep them.)

- [ ] **Step 2: Track conflicts at the screen level**

The conflict banner needs to display above the body column regardless of which surface (title/body/state) caused it. The simplest approach: lift the conflict signal up by giving each `useIssueEdit` consumer the same `queryKey`, but render the banner inside each editor component. That's actually what's already happening at the hook level — each component owns its own conflict state.

For the screen-level shared banner, we need to host the conflict in one place. The simplest path: skip the screen-level banner for v1 and render the banner *inline within each editor*. Update `EditableTitle` and `EditableBody` to render `<ConflictBanner>` above their editor when `editor.conflict` is set.

Add to `editable-title.tsx`'s editing branch, just above the `<input>`:

```tsx
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
```

And import at top of `editable-title.tsx`:
```tsx
import { useQueryClient } from "@tanstack/react-query";
import { ConflictBanner } from "./conflict-banner";
```

Then in the component body:
```tsx
const queryClient = useQueryClient();
```

Do the same in `editable-body.tsx`.

For `status-badge-menu.tsx`, the dropdown closes on select, so the conflict needs to surface elsewhere. For v1: when `editor.conflict` is set on the status menu, render a tiny inline `ConflictBanner` *next to* the badge (small variant). For now, on status conflict, show an alert via the `editor.error` channel — set `error` to a friendly message when `conflict` fires. Quickest: in `useIssueEdit`, when setting `conflict`, also set `error` to a string. Add this line in `use-issue-edit.ts` where the conflict is set:

```ts
setConflict({ … });
setError(
	`This issue's ${field} was just changed on GitHub. Please reload before editing.`,
);
```

`StatusBadgeMenu` already swallows errors silently; surface them via a transient `toast` if your codebase has one, or by adding a tiny `text-destructive` indicator next to the badge. **Practical v1: skip status conflict UI — status edits are atomic open/close clicks, last-write-wins is fine here. Only title/body need the banner.** Document this in the comment above `useIssueEdit({ field: "state" })`.

So: for the status menu, do not surface conflicts in v1. Skip the per-field banner for `state` and let last-write-wins apply.

- [ ] **Step 3: Update `parseGitHubOwnerRepo` and `buildDetailRef` — no changes**

These helpers are unchanged; they already produce the `InboxItemDetailRef` the new components need.

- [ ] **Step 4: Replace the header status badge with `StatusBadgeMenu`**

Find the existing `<span className="rounded-full border …">` block (around line 171) and replace with:

```tsx
<StatusBadgeMenu
	status={item.status}
	state={
		ghQuery.data?.type === "github_issue"
			? ghQuery.data.data.state
			: item.status.key.toLowerCase()
	}
	updatedAt={
		ghQuery.data?.type === "github_issue"
			? (ghQuery.data.data.updatedAt ?? null)
			: null
	}
	detailRef={detailRef}
	detailQueryKey={
		detailRef
			? [
					"tasks",
					"detail",
					"github",
					detailRef.provider,
					detailRef.login,
					detailRef.source,
					detailRef.externalId,
				]
			: ["tasks", "detail", "github", "disabled", item.key]
	}
	editable={item.source === "github-issue" && !!detailRef}
/>
```

- [ ] **Step 5: Replace `<h1>{item.title}</h1>` with `EditableTitle`**

Find the `<h1 className="mt-2 text-base font-medium">{item.title}</h1>` line and replace with:

```tsx
<EditableTitle
	title={
		ghQuery.data?.type === "github_issue"
			? ghQuery.data.data.title
			: item.title
	}
	updatedAt={
		ghQuery.data?.type === "github_issue"
			? (ghQuery.data.data.updatedAt ?? null)
			: null
	}
	detailRef={detailRef}
	detailQueryKey={
		detailRef
			? [
					"tasks",
					"detail",
					"github",
					detailRef.provider,
					detailRef.login,
					detailRef.source,
					detailRef.externalId,
				]
			: ["tasks", "detail", "github", "disabled", item.key]
	}
	editable={item.source === "github-issue" && !!detailRef}
/>
```

- [ ] **Step 6: Replace the `MarkdownBody` usage in the two-column branch with `EditableBody`**

Find the two-column branch (the `item.source === "github-issue" && detailRef ?` block) and replace its `<MarkdownBody body={markdownBody} />` with:

```tsx
<EditableBody
	body={body}
	updatedAt={
		ghQuery.data?.type === "github_issue"
			? (ghQuery.data.data.updatedAt ?? null)
			: null
	}
	detailRef={detailRef}
	detailQueryKey={[
		"tasks",
		"detail",
		"github",
		detailRef.provider,
		detailRef.login,
		detailRef.source,
		detailRef.externalId,
	]}
	editable
/>
```

Leave the non-issue branch's `<MarkdownBody body={markdownBody} />` untouched — Linear/PRs stay read-only.

- [ ] **Step 7: Verify typecheck**

```
bun run typecheck
```

Expected: clean.

- [ ] **Step 8: Verify the full app builds**

```
bun run lint
```

Expected: zero biome + clippy warnings.

- [ ] **Step 9: Commit (when ready)**

```
git add src/features/tasks/components/detail-screen.tsx src/features/tasks/components/editable-title.tsx src/features/tasks/components/editable-body.tsx src/features/tasks/hooks/use-issue-edit.ts
git commit -m "feat(tasks): inline editing for GitHub issue title/body/state"
```

---

### Task 11: Manual verification in the Tauri webview

**Files:** (none — manual run)

- [ ] **Step 1: Start the dev app**

```
bun run dev
```

Wait for the Tauri window to open.

- [ ] **Step 2: Open a GH issue in the tasks screen**

Navigate to the Tasks tab → switch to "All repos" or a repo that has GH issues → click an issue.

- [ ] **Step 3: Verify title editing**

- Hover over the title → pencil icon appears.
- Click pencil → swap to input, pre-selected.
- Type a new title, press Cmd+Enter → "Saving…" appears, then the rendered title updates.
- Verify on GitHub.com that the issue title changed.

- [ ] **Step 4: Verify body editing**

- Hover over the body → pencil appears top-right.
- Click pencil → textarea with raw markdown.
- Edit, press Cmd+Enter → updates inline.
- Verify on GitHub.com.

- [ ] **Step 5: Verify status menu**

- Click the colored status pill → dropdown opens with "Close as completed" / "Close as not planned" (or "Reopen" if closed).
- Pick one → badge updates immediately.
- Verify on GitHub.com.

- [ ] **Step 6: Verify conflict handling**

- Open the same issue on GitHub.com in a browser.
- In Helmor, click the body pencil to enter edit mode.
- In the browser, edit the body and save.
- In Helmor, change the body and press Cmd+Enter.
- Expected: the amber `ConflictBanner` appears above the textarea. Click Reload → draft is dropped, latest remote body is shown.
- Repeat the conflict setup; click Overwrite this time → your version wins.

- [ ] **Step 7: Verify non-issue gating**

- Open a Linear task or a GH PR in the tasks screen.
- Hover over title and body → no pencil appears.
- Status badge → no dropdown, no hover ring.

- [ ] **Step 8: Verify the inbox list updates**

- After editing an issue title, navigate back to the tasks list.
- The edited issue's row title should match the new value (query invalidation worked).

---

## Self-Review Notes

**Spec coverage:** all three editable surfaces (title/body/state) have dedicated tasks; backend endpoint + Tauri command + frontend wrapper + components + screen integration + manual verification are all covered.

**Known v1 simplifications documented in the plan:**
1. Status menu does not surface conflicts — last-write-wins. Title and body do.
2. Conflict banner is per-editor (mounted inside `EditableTitle` / `EditableBody`), not screen-level.
3. The "field changed remotely" check compares remote value to the *proposed* new value rather than the original baseline; if both edits happen to land on the same string, no banner fires (acceptable — no real conflict).

**Type consistency:** `IssueUpdate` shape matches between Rust (`#[serde(rename_all = "camelCase")]`) and TS (`stateReason`). `detailQueryKey` is constructed identically in `detail-screen.tsx` for all three components.

**Placeholder scan:** no TBD / TODO. Every step has runnable code or a precise command.
