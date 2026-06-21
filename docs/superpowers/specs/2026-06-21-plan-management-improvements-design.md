# Plan Management Improvements — Design

**Date:** 2026-06-21
**Status:** Approved (brainstorming) — phased
**Scope:** Six improvements to Helmor's MDX plan management, split into Phase 1 (bugs/quick) and Phase 2 (features).

## Items & decisions

1. **Open `.helmor/plans/<slug>.mdx` from the file browser → formatted plan view** (Phase 1).
   Today clicking it opens raw MDX in Monaco. Route plan paths to the formatted plan view
   via the existing `dispatchOpenPlan` event.
2. **Cmd+W on an open plan crashes the app** (Phase 1). The global `session.close` handler
   has no awareness of the displayed plan, so it tears down the session under the plan. Make
   Cmd+W close the plan first.
3. **Padding on the plan document body** (Phase 1). Only the plan document content (center
   pane), per user choice — not the canvas or strip.
4. **On-edit in-thread trigger** (Phase 2). The persistent strip stays linked; additionally,
   when a plan is edited after creation, show a fresh inline "Plan updated — open" trigger at
   that point in the thread.
5. **Shift+Tab toggles plan mode; composer border goes dashed + recolored when active**
   (Phase 2). Uses the per-turn `permissionMode` (`"plan"` ⇄ `"bypassPermissions"`) that is
   already plumbed to the Claude SDK. Matches Claude Code's own Shift+Tab convention.
6. **Plan-mode read-only audit** (Phase 2). Ensure that when plan mode is active the agent
   can only plan + read files, never write real code. Helmor already sends
   `permissionMode: "plan"` to the SDK (`claude-session-manager.ts`), which blocks
   writes/terminal; audit + tighten and document the guarantee (and Codex's lack of an
   equivalent).

## Phase 1 design

### 1. Plan-file open routing
- `src/features/inspector/panel/files/index.tsx` `handleOpenFile`: if `isMdxPlanPath(absolutePath)`
  and a `currentSessionId` is known, `dispatchOpenPlan({ slug: planSlugFromPath(absolutePath), sessionId })`
  and return; else fall back to the editor as today.
- Thread `currentSessionId` (the displayed thread session) into `FilesTab` (it already
  reaches the inspector; pass it to `FilesTab` like `ActionsTabBody`).
- Helpers from `@/lib/plan-review`: `isMdxPlanPath`, `planSlugFromPath`, `dispatchOpenPlan`.

### 2. Cmd+W closes the plan (crash fix)
Event-based, no state-lifting (mirrors the existing `helmor:open-plan` idiom):
- `src/lib/plan-review.ts`: add `CLOSE_PLAN_EVENT = "helmor:close-plan"` + `dispatchClosePlan()`.
- `src/shell/event-bus.ts`: add `{ type: "plan-surface-changed"; active: boolean }` to the
  shell event union.
- `src/features/panel/container.tsx`: (a) listen for `CLOSE_PLAN_EVENT` → `setActivePlanSlug(null)`;
  (b) `useEffect` publishing `plan-surface-changed` with `active: activePlanSlug != null`
  (cleanup publishes `false`).
- `src/shell/hooks/use-app-shell-state.tsx`: track `planSurfaceActive` via `useShellEvent`,
  pass `planSurfaceActive` + `onClosePlan: dispatchClosePlan` into `useGlobalShortcutHandlers`.
- `src/shell/hooks/use-global-shortcut-handlers.ts`: in `session.close`, branch first on
  `planSurfaceActive` → `onClosePlan()`; widen `enabled` to include `planSurfaceActive`; add
  both to the deps.
- Root cause: closing the session flips `threadSessionId`/`workspace` while `activePlanSlug`
  is still the old plan, so the plan view queries a mismatched `(session, slug)` / null
  workspace before the container's reset effects run. Closing the plan instead of the session
  avoids the teardown entirely.

### 3. Plan document body padding
- `src/features/plan-viewer/plan-view.tsx`: add horizontal (and modest top/bottom) padding to
  the container that wraps the rendered block list, so plan content isn't flush against the
  pane edges. Visual-only; verified manually.

## Phase 2 design (summary — detailed plan later)

- **Shift+Tab toggle:** add a handler in `submit-plugin.tsx` (Shift+Tab → `onTogglePlanMode`)
  that flips `permissionMode` between `"plan"` and `"bypassPermissions"` via the existing
  `onChangePermissionMode(contextKey, mode)` path in `composer/container.tsx`; style the
  composer border (`composer/index.tsx:828`) dashed + accent when `permissionMode === "plan"`.
  Reuse the reserved `composer.togglePlanMode` shortcut registry slot.
- **On-edit trigger:** detect plan edits (the `planFileChanged` watcher already fires) and
  surface an inline "Plan updated — open" message in the thread, in addition to the persistent
  strip. Exact mechanism (synthetic message vs. a lightweight banner keyed off the watcher)
  to be designed in the Phase-2 plan.
- **Read-only audit:** verify the SDK plan permission mode blocks Write/Edit/MultiEdit/Bash
  and allows only read + `ExitPlanMode`; tighten allowed/disallowed tools if gaps exist;
  document Codex's behavior.

## Out of scope
- Canvas/strip padding (user chose plan-body only).
- Changing the underlying permission-mode plumbing (already correct); Phase 2 only adds the
  toggle UX + audit.
