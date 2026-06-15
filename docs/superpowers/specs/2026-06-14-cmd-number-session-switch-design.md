# Cmd+1…9 Session Switching — Design

**Date:** 2026-06-14
**Status:** Approved design, pending implementation plan

## Summary

When the user is inside a workspace, pressing `Cmd+1` through `Cmd+9` switches
the active session by its position in the session tab bar. This mirrors the
tab-switching convention found in browsers and editors (Chrome, VS Code) and
complements the existing `Cmd+Alt+Left/Right` previous/next session shortcuts.

## Scope / when active

The shortcuts are enabled only when:

- a workspace is selected (`selectedWorkspaceId !== null`), and
- `workspaceViewMode === "conversation"`.

They are disabled in the editor and start views and when no workspace is open.
This matches the activation condition already used by `session.next` /
`session.previous` in
`src/shell/hooks/use-global-shortcut-handlers.ts`.

## Index target

`Cmd+N` selects the Nth tab in the session tab bar, counting the **visible
session tabs left-to-right exactly as rendered** in
`src/features/panel/header.tsx`. The special `__context_preview__` tab is
**excluded** from the count. Positions are stable and do not skip idle
sessions — position 3 always equals the 3rd session tab the user sees.

## Behavior

- `Cmd+1` … `Cmd+8` → select the visible session at position 1…8. No-op if that
  position does not exist.
- `Cmd+9` → **overflow stepper**:
  - if the current selection is below position 9, jump to position 9;
  - if already at position ≥ 9, advance by one position;
  - after the last tab, wrap back to position 9;
  - no-op if there are fewer than 9 sessions.
- Pressing any of `Cmd+1`…`Cmd+8` selects an absolute position and thereby
  "resets" the user out of the overflow region.

The shortcuts are **non-repeatable** (single tap per press; no held-key
auto-repeat).

## Components & data flow

1. **`src/features/shortcuts/registry.ts`** — register 9 shortcut definitions
   (`session.select1`…`session.select9`) with default hotkeys `Mod+1`…`Mod+9`,
   group "Navigation", `editable: true`, scoped to the conversation context.
   Because they live in the registry, they automatically become user-rebindable
   in Settings like every other shortcut.
2. **`src/features/shortcuts/types.ts`** — add the 9 new `ShortcutId`s to the
   union type.
3. **`src/shell/controllers/use-selection-controller.ts`** — add
   `selectSessionByOrdinal(ordinal: 1..9)`. It reads the same visible/ordered
   session list the header renders, computes the target session id (including
   the `Cmd+9` stepper logic relative to the current selection), and delegates
   to the existing `selectSession(id)` so all routing/paint/message-fetch
   machinery is reused.
4. **`src/shell/hooks/use-global-shortcut-handlers.ts`** — wire 9 handlers to
   `selectSessionByOrdinal`, each `enabled: workspaceViewMode === "conversation"`
   and non-repeatable.

### Flow

```
Cmd+3 keydown
  → normalizeShortcutEvent() → "Mod+3"
  → useAppShortcuts matches registry id session.select3
  → handler fires: selectSessionByOrdinal(3)
  → resolve ordinal → sessionId against visible session list
  → selectSession(sessionId)
  → router/paint update → tab bar highlights, thread loads
```

## The key correctness constraint

The ordinal must index the **same ordered, filtered list the header renders as
tabs** — not the raw backend `WorkspaceSessionSummary[]` array if the two ever
diverge (e.g. hidden sessions, the context-preview pseudo-tab). The resolver
sources its ordering from the shared visible-session list so that "position N"
in the shortcut always equals the Nth tab the user sees.

## Testing

- Unit-test the ordinal → sessionId resolver as a pure function:
  - `Cmd+1..8` absolute positions,
  - `Cmd+9` first-press to position 9,
  - `Cmd+9` stepper advance and wrap at the end,
  - out-of-bounds positions → no-op,
  - empty / short session lists → no-op.
- No pipeline / Rust / persistence changes — this is frontend-only, so no insta
  snapshot tests are required.

## Non-goals

- No change to session ordering, creation, or closing.
- No new backend or sidecar work.
- No reassignment of existing shortcuts.
