# Canvas as a first-class workspace space

**Date:** 2026-06-28
**Status:** Approved (brainstorming) — ready for implementation planning

## Summary

Pivot canvas from a transient per-workspace *view toggle* into a strict workspace
*type*. Every workspace is exactly one of two kinds — `normal` or `canvas` —
chosen at creation. The sidebar gains a segmented **space switch**
("Workspaces | Canvas") that slides between two worlds:

- **Normal space** keeps today's 3-column layout (sidebar + conversation + inspector).
- **Canvas space** is a full-bleed, immersive world with its own
  **mission-control overview** (live thumbnail tiles + a "+ New canvas" tile) and
  its own switching mechanism — the normal sidebar is not shown.

The old entry points (the per-row "Open in canvas" hover button / context-menu item,
the global `canvasModeEnabled` setting, and the localStorage `useCanvasModeStore`
flag) are removed. "Canvas-ness" becomes a persisted property of the workspace.

## Goals

- Cleanly separate canvas and normal workspaces so each experience can evolve
  independently ("separate things better").
- Make canvas a first-class, always-on space rather than an opt-in flag.
- Give canvas a native, immersive switcher/launcher distinct from the normal sidebar.
- Persist a workspace's kind in the database (survives restarts; CLI/agent visible).

## Non-goals (for now)

- **No cross-space migration UI.** A workspace is strictly assigned to one space at
  creation. The data model is designed so a future "Move to Canvas / Move to Normal"
  is just an `UPDATE` to one column, but the migration UI is out of scope for this work.
- No changes to the canvas panel/connection data model or the canvas rendering engine
  itself (panels, connections, viewport persistence already exist and are reused).
- No reachability for pre-existing canvas data on workspaces that become `normal`
  (it stays dormant in the DB until migration ships later).

## Decisions (from brainstorming)

1. The sidebar switch separates **two spaces**; you only ever look at one kind at a
   time, with a **slide** transition between them.
2. A workspace is **strictly 1:1** with a space, assigned **at creation**. Migration
   between spaces is a future capability, not built now.
3. Canvas is its own **full-bleed, immersive world** — it does **not** reuse the
   normal sidebar. It has a canvas-native switcher and a canvas-native "new workspace".
4. The canvas-native switcher is a **mission-control overview**: live thumbnail tiles
   per canvas workspace + a prominent "+ New canvas" tile; clicking a tile zooms into
   that workspace's canvas.
5. Entry/exit is a **segmented switch both ways** (sidebar → canvas; a corner control
   in canvas → back). Entering canvas opens your **last canvas workspace** (else the
   overview); the overview is always one zoom-out gesture away.
6. The create-new-workspace tab gets an **inline mode toggle on the title line**,
   styled like the existing repo selector.
7. **Remove** the per-row "Open in canvas" button/menu and the global
   `canvasModeEnabled` setting. Canvas is always-on. All existing workspaces become
   `normal`.

## Architecture

### Data model (Rust + SQLite)

- Add a column to `workspaces`: `space TEXT NOT NULL DEFAULT 'normal'`, values
  `'normal' | 'canvas'`. This is **distinct from** the existing `mode` column
  (`worktree | local | chat`, which governs filesystem provisioning) — `mode` is
  unchanged.
- New Rust enum `WorkspaceSpace { Normal, Canvas }` in
  `src-tauri/src/workspace/state.rs`, `#[serde(rename_all = "camelCase")]`,
  serializing as `"normal" | "canvas"`, `#[default] Normal`.
- Thread `space` through `WorkspaceRecord` (`src-tauri/src/models/workspaces.rs`) and
  the workspace query/persistence layer.
- Idempotent migration in `src-tauri/src/schema.rs`: add the column if missing;
  the `DEFAULT 'normal'` backfills all existing rows.
- The workspace creation command/path accepts a `space` argument and writes it.
- Canvas data tables (`canvas_panels`, `canvas_connections`, `canvas_view_state`)
  are **unchanged**; they remain keyed by `workspace_id`.

### Source of truth + UI state

- The DB `space` field is the source of truth for **what kind** a workspace is.
  It replaces the transient localStorage `useCanvasModeStore`.
- A small frontend **UI store** tracks the **active space** ("which world am I
  looking at") and the **last-selected workspace per space**.
  - Active space is the view state; it is not the same as a workspace's `space`.
  - Entering Canvas restores the last canvas workspace, or shows the overview if none.
- Backend → frontend notifications go through the existing `UiMutationEvent`
  pattern (`src-tauri/src/ui_sync/events.rs`) when a workspace's `space` or the
  workspace list changes, handled in `src/shell/hooks/use-ui-sync-bridge.ts` to
  invalidate the right React Query keys. No ad-hoc `app.emit` channels.

### Frontend layout

- `src/shell/components/app-shell-layout.tsx` gains a top-level branch on the
  **active space**:
  - **Normal** → today's 3-column layout (sidebar + conversation/inspector).
  - **Canvas** → the canvas world (no normal sidebar).
- **Space switch**: a segmented control ("Workspaces | Canvas") at the top of the
  normal sidebar; switching slides the window between worlds. A corner control inside
  the canvas world switches back to Normal. The switch toggles the active-space UI
  state (and the slide animation), and selection restores the last-selected workspace
  for the target space.

### Canvas world

- **Mission-control overview**: a grid of live thumbnail tiles (a scaled
  render/snapshot of each canvas workspace's canvas) plus a prominent "+ New canvas"
  tile. Clicking a tile zooms into that workspace's full canvas; "+ New canvas"
  creates a canvas-typed workspace and lands on its (empty) canvas.
- **In-workspace canvas**: the existing `src/features/canvas/` `CanvasSurface`,
  rendered full-bleed, plus a **zoom-out / overview** control to return to mission
  control and the corner space switch back to Normal.
- The canvas-embedded workspace switcher that exists today is replaced by
  mission-control.

### Workspace creation UI

- In the create-new-workspace tab, add an **inline mode toggle on the title line**,
  styled like the existing repo selector — flips Normal ⇄ Canvas.
- Default mirrors the active space at creation time (Canvas world → Canvas default;
  Normal → Normal default), overridable inline.
- The chosen space is passed to the create command and persisted to `workspaces.space`.
- Result: canvas-typed workspaces appear as new tiles in the Canvas overview; normal
  ones appear in the normal sidebar as today.

## Removals

- Per-row "Open in canvas" hover button + context-menu item in
  `src/features/navigation/row-item.tsx`.
- Global `canvasModeEnabled` setting and its gate (settings + any reads, e.g. in
  `app-shell.tsx`). Canvas becomes always-on.
- `useCanvasModeStore` (localStorage transient flag) and `useIsCanvasMode`
  consumers, replaced by the DB `space` field + the active-space UI store.
- Existing workspaces are all treated as `normal`; pre-existing canvas data remains
  dormant in the DB until per-workspace migration ships later.

## Testing

Per the CLAUDE.md rule that schema / persistence / storage-shape changes require
snapshot coverage:

- **Rust:** migration test for the new `space` column + backfill of existing rows to
  `'normal'`; workspace create/query tests asserting `space` round-trips through
  persistence and serializes camelCase; pipeline snapshot tests run after schema
  change to confirm no drift.
- **Frontend:** tests for the space switch (active-space state, last-selected memory,
  slide branch), the creation inline toggle (default per active space, override,
  passes `space` to create), and the canvas-vs-normal layout branch in
  `app-shell-layout`.

## Open questions / follow-ups (later)

- Per-workspace migration between spaces (UI + command) — explicitly deferred.
- Thumbnail strategy for the overview (live scaled render vs. periodic snapshot) —
  to be decided during implementation based on performance of rendering N canvases.
- Whether the CLI (`helmor canvas` / workspace commands) should expose/set `space`.
