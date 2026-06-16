# Design: Primary tag on rows + Verbose running-session preview

Date: 2026-06-15
Status: Approved (pending spec review)

## Summary

Two related improvements to the workspace sidebar (`src/features/navigation/`):

1. **Primary tag** — surface the existing "Primary" badge inline on the workspace row for
   local-mode workspaces, not only inside the hover card.
2. **Verbose filter option** — a new sidebar view toggle that expands each workspace row to
   show a compact, live preview line per *running* session (agent + terminal).

Both are primarily frontend changes. No backend/IPC work is required.

## Context

- A workspace is "primary" when `row.mode === "local"` — it operates on the repo's root
  worktree rather than a Helmor-created per-session worktree. Helper:
  `isPrimaryWorktree(row)` in `workspace-hover-card.tsx`.
- Today the "Primary" badge (`Laptop` icon + "Primary" text) only renders inside
  `WorkspaceHoverCard`. The row itself shows just the `Laptop` branch icon.
- The hover card already implements live session-preview extraction:
  `chooseLiveSessionId()` + `extractLiveActivity()` + `readSessionThread()`. Verbose mode
  reuses this exact machinery inline on the row.
- Running state is tracked by `useBusySessionIds()`
  (`src/lib/session-run-state-context.tsx`), a `Set<string>` of streaming session ids.
- Per-workspace sessions are fetched via `workspaceSessionsQueryOptions(workspaceId)`
  returning `WorkspaceSessionSummary[]` (fields incl. `title`, `agentType`, `sessionKind`
  `"gui" | "terminal"`, `isHidden`, `actionKind`, `status`, `active`).

## Feature 1 — Primary tag on the row

### Behavior
For rows where `row.mode === "local"`, render a compact "Primary" pill inline immediately
after the title. Visible always (not hover-gated). The existing `Laptop` leading icon stays.

### Implementation
- File: `src/features/navigation/row-item.tsx`.
- Add the pill inside the `row-content-fade` wrapper, after `titleSlot`, so it participates
  in the same fade-under-hover-actions behavior.
- Styling: small borderless/secondary badge sized for the `h-7.5` row — `text-mini`,
  `shrink-0`, muted tone. Mirror the hover card's badge vocabulary but tighter. Text only
  (the `Laptop` icon already carries the glyph), to keep the row compact.
- No new data: `mode` is already on `WorkspaceRow`.

### Out of scope
- No change to the hover card's existing "Primary" badge (it can stay).
- No new "primary" concept — purely surfaces the existing `mode === "local"` signal.

## Feature 2 — Verbose running-session preview

### Behavior
A new sidebar view toggle. When ON, each workspace row that has at least one *running*
session expands below the row body to list those running sessions. Per session line:

- **kind icon** — terminal vs agent (e.g. `SquareTerminal` vs agent/provider glyph)
- **title** — the session title
- **provider/agent** — `agentType` (e.g. claude / codex), compact
- **live preview** — for agent (`gui`) sessions: a 1-line truncated snippet of the latest
  assistant text, read live from the thread cache via `extractLiveActivity()`.

Only **running** sessions are listed (membership in `busySessionIds`), excluding hidden
(`isHidden`) and one-off action (`actionKind`) sessions. When a workspace has no running
sessions, the row stays single-line (no expansion) — keeping the sidebar quiet at rest.

### Terminal sessions (decided constraint)
Terminal PTY output is not exposed to the sidebar (it lives only in the xterm view).
Running terminal sessions render as a **label-only** line: kind icon + title + a running
indicator (spinner/dot). No output text. (No backend/PTY-tail work in this change.)

### Architecture
1. **Setting** — add `sidebarVerbose: boolean` to `AppSettings` in `src/lib/settings.ts`,
   defaulting to `false`. Add a localStorage key (`helmor-sidebar-verbose`) for sync boot
   read, mirroring `sidebarGrouping` / `sidebarSort`.
2. **Toggle UI** — add a switch entry to `SidebarViewPopover`
   (`src/features/navigation/sidebar-view-popover.tsx`), labeled e.g. "Verbose — preview
   running sessions". Wire through the container the same way existing sidebar settings are.
3. **Plumbing** — `sidebarVerbose` flows: settings → `navigation/container.tsx` → the
   navigation index / row list → `WorkspaceRowItem` as a `verbose?: boolean` prop. Add
   `verbose` to the `memo` equality comparator in `row-item.tsx`.
4. **New sub-component** — `src/features/navigation/row-sessions-preview.tsx`
   (`WorkspaceRowSessionsPreview`). Kept in its own file per the <300-line / one-responsibility
   rule. It:
   - reads `workspaceSessionsQueryOptions(workspaceId, { staleTime: 5_000 })` and
     `useBusySessionIds()`,
   - filters to running, non-hidden, non-action sessions,
   - sorts deterministically (e.g. by thread length desc, then title),
   - for each `gui` session: `readSessionThread(queryClient, id)` → `extractLiveActivity()`
     → render the last text block, truncated to one line,
   - for each `terminal` session: render label-only line,
   - renders nothing (and the row stays single-line) when the running set is empty.
5. **Row rendering** — in `row-item.tsx`, when `verbose` is set, render
   `<WorkspaceRowSessionsPreview workspaceId={row.id} ... />` beneath `rowBody`. Indentation
   aligns the preview under the title. The expansion must not break the existing context-menu
   / hover-card wrappers (render the preview as a sibling within the row container).

### Shared helpers
`chooseLiveSessionId` / `extractLiveActivity` / `truncateLiveText` / `LIVE_BLOCK_CHAR_BUDGET`
are already exported from `workspace-hover-card.tsx`. If reuse from `row-sessions-preview.tsx`
risks an import cycle or feels misplaced, extract `extractLiveActivity` + helpers into a small
shared module (e.g. `src/features/navigation/live-activity.ts`) and re-export from the hover
card. Prefer extraction if the import shape is awkward; otherwise import directly.

## Data flow

```
AppSettings.sidebarVerbose ──> navigation/container ──> row list ──> WorkspaceRowItem(verbose)
                                                                          │ verbose && running?
                                                                          ▼
                                              WorkspaceRowSessionsPreview(workspaceId)
                                                 ├─ workspaceSessionsQueryOptions
                                                 ├─ useBusySessionIds()
                                                 └─ readSessionThread + extractLiveActivity (gui)
```

## Error / edge handling
- No running sessions → no expansion (row unchanged).
- Sessions query loading/empty → render nothing (no skeleton churn in the sidebar).
- Agent session running but thread cache empty (never opened) → show title + provider +
  running indicator, omit preview text (graceful — same shape as terminal line).
- Verbose toggle persists across reloads via localStorage + settings store.
- Virtual-list row recycling: keep preview subscriptions keyed by `workspaceId` so a recycled
  row re-syncs (consistent with existing `useIsRunScriptRunning` pattern).

## Testing
- Frontend (vitest):
  - `isPrimaryWorktree` rows render the "Primary" pill; non-local rows do not.
  - `WorkspaceRowSessionsPreview`: given mocked sessions + busy set + thread cache, renders
    one line per running session; excludes hidden/action/non-running; terminal lines are
    label-only; empty running set renders nothing.
  - `SidebarViewPopover` toggles `sidebarVerbose` and persists.
- No Rust/pipeline changes → no snapshot tests needed (no `pipeline/`, persistence, or
  `schema.rs` touched).

## Out of scope / YAGNI
- Terminal PTY output tailing (no backend work this change).
- Configurable preview length / multi-line previews.
- Previewing non-running sessions.
- Any change to the message pipeline or persistence layer.
