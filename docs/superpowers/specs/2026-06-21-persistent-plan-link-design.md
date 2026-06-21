# Persistent Plan Link (pinned strip) — Design

**Date:** 2026-06-21
**Status:** Approved (brainstorming) — pending implementation plan
**Scope:** A persistent, always-visible link to the session's plan, pinned at the top of the chat thread.

## Summary

Today, when the agent finishes an MDX plan (calls `ExitPlanMode` with a
`.helmor/plans/<slug>.mdx` path), the chat renders an inline `PlanReviewCard` with an
"Open plan" button. That card scrolls away with the conversation. The user wants the plan
link to be **always one click away**.

Add a slim, pinned **`PlanLinkStrip`** at the top of the chat thread (below the panel
header, above the scrolling messages). It shows the plan title + an "Open" button whenever
the session has a plan file, and reuses the existing `helmor:open-plan` event + Plan-tab
wiring. Frontend-only: no Rust, no pipeline/storage changes.

## Decisions (from brainstorming)

1. **Placement:** pinned header strip at the top of the chat thread; stays put while
   messages scroll; only shown with the chat thread (auto-hidden on plan/terminal/context
   surfaces because it lives inside `ActiveThreadViewport`).
2. **Content & visibility:** plan **title** + "Open" button, shown **whenever a plan file
   exists** for the session (resolved or not).
3. **Frontend-only:** reuse `dispatchOpenPlan` + the panel container's existing
   `helmor:open-plan` listener and Plan tab. No backend changes.

## Data source

- **Featured slug:** `latestMdxPlanSlug(messages)` — a new helper in `src/lib/plan-review.ts`,
  identical to the existing `latestUnresolvedMdxPlanSlug` but **without** the "no user
  message after it" constraint. Returns the slug of the most recent `plan-review` part whose
  `planFilePath` is an MDX plan path, else `null`.
- **Title + existence:** `usePlanList(sessionId)` (`PlanSummary[]` = `{ slug, title, status,
  path }`).
- **Featured summary:** `list.find(s => s.slug === featuredSlug)`. If `featuredSlug` is null
  (no plan-review in the loaded message window — e.g. a reopened, paginated session) but the
  list is non-empty, fall back to `list[0]` so the strip still appears whenever a plan file
  exists.
- If no plan file exists (`list` empty and no featured summary) → render `null`.

## Component

`src/features/panel/message-components/plan-link-strip.tsx` — `PlanLinkStrip({ sessionId, messages })`:
- Computes featured summary as above.
- Renders a slim bar (~`h-9`, bottom border, same token palette as `PlanReviewCard`):
  `ClipboardList` icon + plan **title** (truncated) + an "Open" button →
  `dispatchOpenPlan({ slug, sessionId })`.
- When the list has more than one plan, append a subtle "· N plans" hint after the title.
- Returns `null` when there is no plan to show.

## Placement / wiring

In `src/features/panel/thread-viewport.tsx`, `ActiveThreadViewport`:
- Change the outer `stackRef` wrapper from a row to a column (`flex-col`).
- Render `<PlanLinkStrip sessionId={pane.sessionId} messages={pane.messages} />` as a
  `shrink-0` first child, above the existing `flex-1` thread wrapper.
- `PlanLinkStrip` returning `null` means zero layout impact when there's no plan.

This keeps the strip a non-scrolling sibling of the scroll area, so it stays pinned. It
renders only in the chat-thread branch of `WorkspacePanel` (not when a plan/terminal/context
surface is active), satisfying "auto-hidden when already viewing the plan".

## Testing (all frontend)

- `latestMdxPlanSlug` unit tests in `src/lib/plan-review.test.ts`: returns the latest
  plan-review slug regardless of a trailing user message; null when none / non-MDX path.
- `PlanLinkStrip` component test: with a plan list + a plan-review message, renders the
  title and the "Open" button dispatches `helmor:open-plan` with the right slug+sessionId;
  renders nothing when the list is empty.

## Out of scope

- Backend recency ordering for `PlanSummary` (not needed; the latest plan-review drives the
  featured plan).
- A multi-plan picker in the strip (the Plan tab's existing plan-tabs handle switching).
- Pinned-plan projection via `sessionPlanStateQueryOptions` (unused; the plan-file list +
  latest plan-review are sufficient).
