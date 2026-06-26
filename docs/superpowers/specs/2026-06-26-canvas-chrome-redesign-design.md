# Canvas chrome redesign + image backgrounds — Design

**Date:** 2026-06-26
**Status:** Approved (design); pending implementation plan
**Area:** `src/features/canvas/` + `src-tauri` canvas persistence

## Goal

Redesign the infinite-canvas chrome into two vertically-centered Apple "liquid-glass"
rails plus a selectable image background, replacing the current ad-hoc left manage-rail
and right create-toolbar. Add 5 curated background images (plus custom upload) and a new
Git canvas panel type.

## In scope

- Two centered glass rails (left + right), restyled top-left workspace switcher.
- "Customize canvas" appearance popover (backgrounds, translucency, grid, theme).
- 5 curated background images + custom upload, rendered behind the canvas.
- New `git` canvas panel type (reuses the existing inspector Changes/Git view).
- Keep the existing top-center selection toolbar (light glass restyle only).

## Out of scope (later specs)

- **Browser** canvas panel — needs native-webview keying (`browser-content-{pane_id}`
  registry work). Shown in the right rail as a disabled "coming soon" item.
- **Agent interacts with canvas** — e.g. select a note panel and ask the agent to write
  on it. Future spec; no backend/IPC work this round.

## Core idea: one unified rail/arm model

Both rails are **panel-type pickers** that share the existing arm-then-draw flow. There
is no new placement mechanic — left and right rails both drive `useCanvasCreateStore`:

1. Click a rail item → `useCanvasCreateStore.toggle(type)` arms that `CanvasPanelType`.
2. `CanvasCreateOverlay` switches the canvas into crosshair draw mode.
3. User drags a rectangle → `addPanel(type, { x, y, width, height })` spawns the panel at
   the **exact** drawn rect (the behaviour the prior session hardened — a sub-minimum box
   creates nothing and stays armed).
4. Clicking the armed item again disarms.

This keeps the left and right rails behaviourally identical; they differ only in which
types they expose.

## Components

All under `src/features/canvas/chrome/` unless noted. New files are focused (<300 lines).

### `glass-rail.tsx` (new, shared primitive)
- `GlassRail` — vertically-centered container fixed to a screen edge
  (`top-1/2 -translate-y-1/2`, `pointer-events-auto`, `z-10`). Apple liquid-glass styling:
  `backdrop-blur-2xl`, translucent fill (`bg-app-base/40` light / `bg-black/25` dark),
  `ring-1` hairline, subtle inner top-highlight, `rounded-[20px]`, large soft shadow.
- `RailButton` — icon button (`cursor-pointer`), hover tooltip with the label, `aria-pressed`
  reflecting armed state, armed highlight reusing the existing `--color-selected` treatment
  from `canvas-create-toolbar.tsx`.

### `left-rail.tsx` (new)
Items, top→bottom:
- **Back** — exits canvas: `useCanvasModeStore.getState().setMode(workspaceId, false)`.
- **Create conversation** — arms `"conversation"`.
- **Create terminal** — arms `"terminal"`.
- **Customize canvas** — toggles the Customize popover (does not arm a type).

### `right-rail.tsx` (new, replaces `canvas-create-toolbar.tsx`)
Items, top→bottom:
- **Browser** — disabled "coming soon" `RailButton` (tooltip explains it's coming).
- **Files** — arms `"file-manager"`.
- **Git** — arms `"git"` (new type, see below).
- **Editor** — arms `"editor"`.
- **More** — popover listing remaining creatable types: **Notes** (`"notes"`),
  **Drawing** (`"drawing"`). Each list item arms its type and closes the popover.

`canvas-create-toolbar.tsx` is removed; its `PALETTE`/arm logic is absorbed by the two rails.

### `workspace-controls.tsx` (restyle)
Keep `CanvasWorkspaceControls` (top-left workspace dropdown + exit). Restyle the container
to the glass language so it matches the rails. No behaviour change.

### `selection-toolbar.tsx` (light restyle)
Keep the existing top-center `CanvasSelectionToolbar` exactly as-is functionally (rename,
translucency, z-order, lock, duplicate, delete, connect handles). Apply only the glass
container styling for visual consistency.

### `customize-popover.tsx` (new)
Glass popover anchored to the left rail's "Customize canvas" button. Holds the appearance
controls migrated out of the old `manage-rail.tsx`:
- **Background picker** — a grid of 5 curated thumbnails + an **Upload** tile. Selecting a
  thumbnail sets `backgroundImage` to its preset key; Upload triggers the file flow below;
  a "None" option clears it.
- **Translucency** slider → `setAppearance({ translucency })`.
- **Grid pattern** — None / Dots / Lines → `setAppearance({ backgroundPattern })`.
- **Theme** — system / light / dark → `setAppearance({ backgroundTheme })`.

### `manage-rail.tsx` (removed)
The appearance section moves to `customize-popover.tsx`. The "jump to panel" list is
**dropped** for now (YAGNI; can return later if needed). `snap-to-grid` stays available via
`setAppearance` and can live in the Customize popover.

## Backgrounds

### Curated set
- 5 bundled images under `src/features/canvas/backgrounds/` with an `index.ts` exporting a
  typed registry: `{ key, label, thumbnail, full }`. Suggested aesthetic: soft mesh-gradient,
  aurora, dark topography, warm dusk, calm grid-mist. Cohesive, low-contrast so panels stay
  legible. (Image generation is an implementation task; the plan will decide format/size.)

### Appearance field
- Extend `CanvasAppearance` and `CanvasViewState` with `backgroundImage: string | null`.
  Value is either a preset key (`"aurora"`, …) or a custom asset reference (see upload).
- `useCanvasViewStore`: add `backgroundImage` to state, include it in `scheduleSave`'s
  `saveCanvasViewState` payload, and in `hydrate`.

### Rendering
- In `index.tsx`, render an absolutely-positioned cover layer **behind** the React Flow
  surface: a `<div>` with `background-image` (cover, centered), plus a translucency/scrim
  overlay so the existing React Flow `<Background>` grid + DOM panels remain legible.
- Grid (`<Background>` dots/lines) and translucency continue to work on top of the image.

### Custom upload (file-on-disk)
- New Rust command (e.g. `save_canvas_background`) writes the uploaded image bytes to the
  data dir (e.g. `{data_dir}/canvas-backgrounds/{workspaceId}-{uuid}.{ext}`) and returns an
  asset path usable by the webview (Tauri `convertFileSrc`/asset protocol).
- The returned reference is stored in `background_image`. Rationale: keeps the SQLite row
  small vs. embedding a data-URL.
- `api.ts`: typed wrapper `saveCanvasBackground(workspaceId, bytes/path)`.

## New Git panel type

- Add `"git"` to `CanvasPanelType` (`api.ts`) and to the panel renderer.
- `panel-config.ts`: `GitPanelConfig = {}` (workspace-scoped; no extra config) folded into
  `PanelConfig`.
- `panel-node.tsx`: render a Git panel body that reuses Helmor's existing inspector
  Changes/Git view component (Git and Changes are the same surface).
- `use-canvas-graph.ts`: handle `"git"` in `addPanel` default sizing/title and
  `panelToNode`/`nodeToPanel`.
- Git == Changes: a single "Git" rail item; no separate "Changes" item.

## Persistence & schema

- `schema.rs`: idempotent migration adding nullable `background_image TEXT` to
  `canvas_view_state`.
- `models/` canvas view-state repo: read/write the new column; serde camelCase
  `backgroundImage`.
- New canvas-background upload command wired in `commands/` (domain logic separate from IPC
  glue per repo conventions).
- `canvas_panels` already stores arbitrary `panel_type` + opaque `config`; the `git` type
  needs no schema change beyond accepting the new type string.

## Data flow

```
Rail click ──> useCanvasCreateStore.toggle(type) ──> CanvasCreateOverlay (draw)
            ──> addPanel(type, rect) ──> saveCanvasPanel (debounced)

Customize ──> useCanvasViewStore.setAppearance({ backgroundImage | translucency
              | backgroundPattern | backgroundTheme }) ──> saveCanvasViewState (debounced)

Upload ──> invoke("save_canvas_background", …) ──> asset path
        ──> setAppearance({ backgroundImage: path })
```

## Testing

- **Frontend** (vitest): rails arm the correct types; Back exits canvas; Customize popover
  sets appearance; background layer renders for a preset and for `null`; More popover arms
  notes/drawing. Extend the existing canvas test suite.
- **Rust** (cargo + insta): `canvas_view_state` round-trips `background_image` (load/save);
  migration is idempotent; `git` panel type persists and reloads. Per repo rule, any change
  to canvas persistence / `schema.rs` storage shape gets snapshot/round-trip coverage.
- `bun run typecheck`, `bun run lint` (biome + clippy) clean.

## File touch list (anticipated)

New:
- `src/features/canvas/chrome/glass-rail.tsx`
- `src/features/canvas/chrome/left-rail.tsx`
- `src/features/canvas/chrome/right-rail.tsx`
- `src/features/canvas/chrome/customize-popover.tsx`
- `src/features/canvas/backgrounds/` (5 images + `index.ts`)

Modified:
- `src/features/canvas/index.tsx` (mount rails, render background layer)
- `src/features/canvas/canvas-view-store.ts` (`backgroundImage`)
- `src/features/canvas/chrome/workspace-controls.tsx` (glass restyle)
- `src/features/canvas/chrome/selection-toolbar.tsx` (glass restyle)
- `src/features/canvas/panel-config.ts` (`git` config)
- `src/features/canvas/types.ts` / `use-canvas-graph.ts` (`git` type)
- `src/features/canvas/panel-node.tsx` (`git` body)
- `src/lib/api.ts` (`CanvasPanelType += "git"`, `backgroundImage`, `saveCanvasBackground`)
- `src-tauri/src/schema.rs`, `models/` canvas repo, `commands/` (upload command)

Removed:
- `src/features/canvas/canvas-create-toolbar.tsx`
- `src/features/canvas/chrome/manage-rail.tsx`

## Open decisions (resolved)

- Backgrounds source: **curated 5 + custom upload**.
- Right rail click: **arm-then-draw**, panel spawns at the exact drawn size/position.
- Panel customize UI: **keep top-center selection toolbar**.
- Customize canvas: **background + full appearance panel**.
- More menu: **remaining panel types (Notes, Drawing)**.
- Right rail set: Browser (stub), Files, Git (== Changes), Editor, More.
- Custom-background storage: **file-on-disk in data dir**.
- Panel list: **dropped**.
