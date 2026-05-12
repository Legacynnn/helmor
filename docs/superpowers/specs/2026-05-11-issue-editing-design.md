# GitHub issue editing — design

**Date:** 2026-05-11
**Scope:** Inline editing of GitHub issue title, body, and state from the tasks detail screen, synced via the GitHub REST API. Linear tasks and PRs are out of scope for this pass.

## Goals

- Edit title, body, and open/closed state inline without leaving the detail screen.
- Keep the read view uncluttered: editing affordances appear only on hover.
- Optimistic updates with conflict detection. No silent overwrites of remote edits.
- Feel native, low-friction, no jank.

## Non-goals (this pass)

- Editing Linear tasks (separate mutation surface).
- Editing pull requests (different field shape — mergeable, draft, branches).
- Editing labels, assignees, milestones (separate picker UIs; future work).
- Rich-text WYSIWYG editor.
- Live markdown preview during edit.

## Architecture overview

Three editable surfaces on the GH-issue detail screen:

1. **Title** — `<h1>` with a hover-reveal pencil; click to swap into a single-line `<input>`.
2. **Body** — `MarkdownBody` with a hover-reveal pencil; click to swap into an auto-resizing `<textarea>` containing raw markdown.
3. **Status badge** — the existing gradient pill becomes a `DropdownMenu` trigger with open/close actions.

Each surface is independent — editing the title does not lock the body. Save and cancel are explicit per surface.

State sync goes through one new Tauri command `update_github_issue` that PATCHes `/repos/:owner/:repo/issues/:number` and returns the refreshed `GithubIssueDetail`. The frontend implements the staleness check (Rust just does the PATCH).

Non-issue items (Linear, PRs) gate the pencils and dropdown out entirely and continue to render today's read-only `<h1>` and `MarkdownBody`.

## Backend

### New module: `src-tauri/src/forge/github/issue_edit.rs`

Mirrors the shape of `issue_comments.rs`.

```rust
pub struct IssueUpdate {
    pub title: Option<String>,
    pub body: Option<String>,
    pub state: Option<String>,         // "open" | "closed"
    pub state_reason: Option<String>,  // "completed" | "not_planned" | "reopened"
}

pub fn update_issue(
    login: &str,
    external_id: &str,
    update: IssueUpdate,
) -> Result<GithubIssueDetail>
```

Implementation: invoke `gh api -X PATCH /repos/:owner/:repo/issues/:number -f <field>=<value>` for each field present in `IssueUpdate`. Only present fields are sent; `None` fields are omitted from the request entirely (so a body-only edit doesn't blank the title).

Response is parsed via the existing `IssueRestResponse` shape and converted to `GithubIssueDetail` via a new shared helper (see refactor below).

Auth handling matches `issue_comments.rs`: surface auth rejection as a typed error the frontend can render as a "Reconnect GitHub" CTA.

### Tauri command: `commands/forge_commands.rs`

```rust
#[tauri::command]
pub async fn update_github_issue(
    login: String,
    external_id: String,
    update: IssueUpdate,
) -> CmdResult<GithubIssueDetail>
```

Registered in `lib.rs` alongside the existing `list_github_issue_comments` / `create_github_issue_comment` commands.

### Refactor: shared `IssueRestResponse → GithubIssueDetail` mapping

Today `fetch_issue_detail` in `inbox.rs` inlines the field mapping. Extract it to a `pub(super) fn issue_detail_from_rest(response: IssueRestResponse, external_id: &str) -> GithubIssueDetail` helper so the new `update_issue` path uses the same mapping. No other callers; ~10 lines moved.

## Frontend

### New API wrappers in `src/lib/api.ts`

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
): Promise<GitHubIssueDetail>
```

Mirrors the existing `createGithubIssueComment` pattern (camelCase serialization, `describeInvokeError` wrapping).

### Components

#### `EditableTitle` (`src/features/tasks/components/editable-title.tsx`)

- Renders an `<h1>` plus an inline `Pencil` button that fades from `opacity-0` to `opacity-100` over 100ms on row hover.
- Click pencil → enter edit mode: swap to a single-line `<input>` pre-filled with the current title, focused, text selected.
- Below the input: right-aligned `Cancel` (ghost) and `Save` (primary) buttons.
- Keyboard: `Esc` cancels, `Enter` or `Cmd/Ctrl+Enter` saves.
- Save disabled when title is empty or unchanged from the snapshot.
- Saving state: Save button label becomes "Saving…" with an inline spinner; both buttons disabled; input becomes readonly (not disabled — preserves caret/selection on failure).
- Error: inline message below the buttons ("Couldn't save: {message}"). Auth errors get a "Reconnect GitHub" CTA.

Props:

```ts
{
    title: string;
    snapshotUpdatedAt: string | null;
    onSave: (next: string, snapshotUpdatedAt: string | null) => Promise<void>;
    isEditable: boolean; // false for Linear / PRs
}
```

#### `EditableBody` (`src/features/tasks/components/editable-body.tsx`)

- Wraps the existing `MarkdownBody`.
- `Pencil` button absolutely positioned top-right of the body container with a subtle `bg-background/80 backdrop-blur` so it doesn't sit on top of text. Fades in on container hover.
- Click pencil → enter edit mode: swap rendered markdown for an auto-resizing `<textarea>` containing the raw markdown source, focused.
- Auto-resize via CSS `field-sizing: content` with `min-height: 12rem` fallback for browsers without support.
- Same Save / Cancel layout and keyboard shortcuts as `EditableTitle`. Plain `Enter` inserts a newline in the textarea (unlike single-line title).
- Empty body: the "No description provided." fallback gets a pencil too. Click jumps into an empty textarea with placeholder "Write a description…".

Props mirror `EditableTitle` with `body: string`.

#### `StatusBadgeMenu` (replaces the static `<span>` in `detail-screen.tsx` header)

- Wraps the existing gradient pill in `<DropdownMenu>`.
- Trigger gets `cursor-pointer` and a `ring-1 ring-foreground/15` on hover so users see it's interactive.
- Menu items, conditional on current `state`:
  - `open`: "Close as completed" (Check), "Close as not planned" (CircleX)
  - `closed`: "Reopen issue" (RotateCw)
- Selecting an item calls `updateGithubIssue` with `state` + `state_reason`.
- Optimistic update: cache write happens before the menu closes; badge color flips immediately.

#### `ConflictBanner` (inline in `detail-screen.tsx`)

- Mounts above the body column only when an edit save detected staleness.
- `bg-amber-500/10 border-amber-500/30` tinted banner, full body-column width.
- Copy: "This issue was edited on GitHub {relativeTime}. Your changes haven't been saved yet."
- Two buttons: `Reload` (primary — drops local edit + refetches detail), `Overwrite` (ghost — re-sends the PATCH ignoring the staleness check).
- Dismissible via X. Dismissing without choosing is equivalent to staying in edit mode with the user's draft intact; next Save attempt re-runs the check.

### Gating

`EditableTitle`, `EditableBody`, and `StatusBadgeMenu` are mounted only when `item.source === "github-issue" && detailRef`. Otherwise the detail screen renders today's static `<h1>`, `MarkdownBody`, and static gradient `<span>`.

## State management & data flow

### Edit mode state

Each editable surface owns its own `useState` for `isEditing`, `draft`, `snapshotUpdatedAt`, `isSaving`, `error`, `forceOverwrite`. No global state, no context. Closing the detail screen with an unsaved edit silently drops it (matches GitHub.com behavior).

### Staleness anchor

When entering edit mode, the component snapshots `detail.updatedAt` from the current React Query cache. This is the "I last saw the issue at version X" marker.

### Save flow (per surface)

1. User clicks Save → component sets `isSaving=true`, disables buttons.
2. If `forceOverwrite` is true (user picked Overwrite in the conflict banner), skip to step 4.
3. Refetch `getInboxItemDetail` (bypassing the staleTime — `queryClient.fetchQuery`) to get current remote state.
4. If remote `updated_at === snapshotUpdatedAt` → no conflict → call `updateGithubIssue` with the changed field. On success, write returned detail into the cache via `queryClient.setQueryData`, exit edit mode, clear state.
5. If remote `updated_at !== snapshotUpdatedAt` AND the *remote field value* for the field we're editing has also changed → conflict. Mount `ConflictBanner`, keep edit mode open with the draft preserved. User picks Reload (drop draft + cache update from refetch + exit edit) or Overwrite (sets `forceOverwrite=true`, re-runs Save).
6. If `updated_at` differs but the field we're editing did not change remotely (e.g. someone added a label) → no conflict. Update the snapshot to the new `updated_at`, proceed to PATCH.

### Optimistic updates

On successful PATCH, the returned `GithubIssueDetail` is the canonical post-save state and is written into the `getInboxItemDetail` cache. No separate refetch needed. The status badge and body re-render from the new cache entry.

The status badge dropdown does the optimistic write *before* the PATCH (so the click feels instant); rolls back on failure.

The title and body editors apply the optimistic cache write *after* the PATCH succeeds so the markdown render in the read view is guaranteed to be the new value when the editor unmounts (avoids a one-frame flicker of old content).

### Error handling

- Network / 5xx: keep edit mode open, draft intact, inline error below buttons.
- 422 validation: same — show the GH error message.
- Auth: keep edit mode open, inline "Reconnect GitHub" CTA that opens settings.
- Conflict (staleness detected): conflict banner; draft preserved.

### Query invalidation

On successful save, invalidate the inbox list queries (`["tasks"]` root key) so the row title and status update in the list view. The detail cache is updated in-place via `setQueryData`, so no refetch loop.

## Visual polish

- **Pencil icon:** 14px `Pencil` (lucide), `text-muted-foreground/60`, 100ms fade on container hover, 24×24 click target.
- **Title pencil:** inline at end of `<h1>` row, reserves space so hover doesn't cause layout shift.
- **Body pencil:** absolute top-right of body container, `bg-background/80 backdrop-blur` so it sits above text legibly.
- **Edit fields:** match the comment composer — `border-border/60`, `bg-background`, focus `border-foreground/40`.
- **Buttons:** Save = `size="sm"` primary, Cancel = `variant="ghost" size="sm"`. Right-aligned in a `gap-2` row.
- **Saving state:** Save label → "Saving…" with spinner. Input/textarea readonly (not disabled).
- **Status badge hover:** `cursor-pointer`, `ring-1 ring-foreground/15`, dropdown opens below-left.
- **Empty body:** fallback "No description provided." also gets a pencil; click → empty textarea, placeholder "Write a description…".
- **Conflict banner:** amber-tinted, full body-column width, Reload primary / Overwrite ghost, dismissible X, relative timestamp of remote edit.
- **No layout shift:** pencils sit in pre-reserved space (inline-block fixed-width for title, absolute for body).
- **No flicker on save:** optimistic cache write before editor unmounts.

## Out of scope (future work)

- Editing labels, assignees, milestones.
- Editing Linear tasks.
- Editing pull requests.
- Live markdown preview during edit.
- Edit history / undo within the session.
- Mention autocomplete in title/body.

## Files touched

**New:**
- `src-tauri/src/forge/github/issue_edit.rs`
- `src/features/tasks/components/editable-title.tsx`
- `src/features/tasks/components/editable-body.tsx`
- `src/features/tasks/components/status-badge-menu.tsx`
- `src/features/tasks/components/conflict-banner.tsx`

**Modified:**
- `src-tauri/src/forge/github/mod.rs` — export `update_issue`.
- `src-tauri/src/forge/github/inbox.rs` — extract `issue_detail_from_rest` helper.
- `src-tauri/src/commands/forge_commands.rs` — `update_github_issue` Tauri command.
- `src-tauri/src/lib.rs` — register the command.
- `src/lib/api.ts` — `updateGithubIssue` wrapper, `IssueUpdate` type.
- `src/features/tasks/components/detail-screen.tsx` — mount the new components behind the issue source gate; host the conflict banner.
