# Canvas Selection Toolbar Glass + Physics Connect Cable — Design

Date: 2026-06-27
Status: Approved (pending spec review)
Area: `src/features/canvas/`

## Summary

Two changes to the split-canvas main workspace area:

1. **Toolbar restyle** — `CanvasSelectionToolbar` (the floating control panel shown
   when a single pane is selected) currently uses a one-off, very opaque style. Unify
   it with the app's shared "liquid glass" recipe, but make it a little more solid than
   the side rails and one size step bigger.
2. **Physics Connect cable** — replace the placeholder Connect button (currently a
   no-op boolean toggle) with a real, draggable Verlet-rope cable that spawns from the
   selected pane, sags under gravity, collides with / drapes over other panes, and can
   be plugged into another pane. **Decorative only for this pass** — plugging in does
   not yet write a persistent connection; that logic comes later behind a clean seam.

## Part A — Toolbar restyle

File: `src/features/canvas/chrome/selection-toolbar.tsx`

Current container classes:

```
-translate-x-1/2 pointer-events-auto absolute top-3 left-1/2 z-20 flex items-center
gap-1 rounded-[16px] border bg-popover/95 px-1.5 py-1 backdrop-blur-xl
```

Target — adopt the shared glass recipe used by `GlassRail` / `CanvasWorkspaceControls`
(`border-white/15 ring-1 ring-white/10 shadow-2xl backdrop-blur-2xl`) but:

- Background `bg-app-base/65` (more solid than the rails' `/40`, i.e. "less translucent").
- Blur `backdrop-blur-2xl`.
- Border `border-white/15`, plus `ring-1 ring-white/10`, `shadow-2xl`.
- Keep the existing selection-color glow `boxShadow` and `borderColor` inline styles
  (layer them over the new ring/shadow; the inline `boxShadow` already includes a base
  drop shadow, so retain it and the class shadow is a complementary fallback).
- Size bump one step: `px-1.5 py-1` → `px-2.5 py-1.5`, `gap-1` → `gap-1.5`,
  radius `rounded-[16px]` → `rounded-[18px]`.
- Toolbar button icons `size-3.5` → `size-4` (apply consistently to all toolbar icons:
  Droplets, Cable, lock, duplicate, delete).

No behavioral change in Part A.

## Part B — Physics Connect cable

### Goal

Clicking Connect on the selected pane spawns a literal cable on the canvas. One end is
pinned to the source pane's right-edge connect anchor; the other end is a "plug" the user
drags. The cable is a Verlet rope: it hangs and sways under gravity and collides with
other panes (drapes over them). Releasing the plug over another pane visually plugs in
(decorative snap to that pane's handle). Releasing over empty space lets the plug fall and
the cable dangles from the source until grabbed again or dismissed.

### New module: `src/features/canvas/cable/`

#### `verlet-rope.ts` — pure simulation (no React)

- State: array of points `{ x, y, px, py, pinned }` in **flow coordinates**, plus
  `segmentLength` and tuning constants (gravity, damping, constraint iterations).
- `createRope(start, end, segments)` — evenly distribute points between anchor and plug.
- `step(rope, { gravity, dt, colliders, anchor, plug })`:
  1. Verlet integration: `x += (x - px) * damping + gravity` per point (skip pinned).
  2. Pin endpoint(s): point[0] = anchor; if `plug` provided, last point = plug.
  3. Relax distance constraints between neighbors over N iterations.
  4. Collision: for each non-pinned point inside any collider AABB, push it to the
     nearest rectangle edge (with a small skin offset).
- `colliders` are AABBs `{ x, y, w, h }` in flow coordinates.
- Deterministic given inputs (caller supplies `dt`; no internal clock) → unit-testable.

#### `cable-store.ts` — zustand store (mirrors `connections-store.ts`)

- State: `active: null | { sourcePaneId, anchor: {x,y}, plug: {x,y}, dragging: bool,
  hoveredTargetId: string | null, dangling: bool }`.
- Actions: `spawn(sourcePaneId, anchor)`, `updatePlug(point, hoveredTargetId)`,
  `setDragging(bool)`, `plugInto(targetPaneId)` (decorative — records hovered target,
  marks plugged; **clean seam for future persistent-connection write**), `release()`
  (drop into dangling state), `cancel()`.

#### `cable-overlay.tsx` — SVG overlay + rAF loop

- Mounted once inside the canvas root, absolutely positioned, covers the React Flow pane.
- Reads pane rects via `useReactFlow().getNodes()` (position + measured width/height) as
  colliders; reads viewport via `useViewport()`.
- Simulates in flow coordinates; projects points to screen using the viewport transform
  `(x * zoom + tx, y * zoom + ty)` for drawing, so the cable pans/zooms with the canvas.
- `requestAnimationFrame` loop calls `step` with a clamped `dt`; renders the rope as a
  smooth SVG path plus a plug head at the free end.
- Pointer handling: pointer-events enabled only on the plug head (and during drag).
  Dragging updates `updatePlug` (screen→flow inverse transform); hover-detection sets
  `hoveredTargetId` when over a pane (highlight that pane's handle). Release over a pane
  → `plugInto`; release over empty → `release()` (dangle). The cable also has a way to
  dismiss (toggling Connect off, or a small affordance — Connect toggle is sufficient).

### Wiring

File: `src/features/canvas/chrome/selection-toolbar.tsx`

- Replace local `connecting` boolean + `setConnecting` no-op with cable-store driven
  state. Connect button:
  - When no active cable for this pane: `spawn(selectedPaneId, rightHandleAnchorInFlowCoords)`.
  - When active: `cancel()`.
  - `active` shows the button in its active state.
- Compute the anchor from the selected pane node's position + size (right-edge midpoint),
  matching where the React Flow `source` handle sits in `panel-node.tsx`.

Mount `CableOverlay` once in the canvas root component (the same component that renders
React Flow / `panel-node`s), inside the React Flow provider so `useReactFlow`/`useViewport`
work.

### Decorative scope / future seam

- `plugInto(targetPaneId)` does **not** call `connections-store` / `saveCanvasConnection`.
  It only updates visual state. A `// TODO: persist real connection here` seam is left so
  the later pass can create the actual edge (`addConnection`) without reworking the cable.

## Testing

- **vitest** unit tests for `verlet-rope.ts`:
  - A free point gains downward velocity after `step` with gravity (gravity integration).
  - Distance constraints converge: after stepping, neighbor distances ≈ `segmentLength`.
  - Pinned endpoints stay at anchor/plug.
  - A point placed inside a collider AABB is pushed to the nearest edge (collision).
- No `pipeline/` / persistence / `schema.rs` changes → no Rust snapshot tests required.
- Overlay is visual-only; no snapshot test.

## File organization

All new code lives under `src/features/canvas/cable/` (each file one responsibility,
well under the 300-line limit). No logic added to `App.tsx` or `src/lib/`. Follows the
existing `connections/` sibling pattern.

## Out of scope

- Persisting cable connections to the DB (future pass).
- Collision with canvas floor / cable coiling / piling.
- Multiple simultaneous active cables (one active cable at a time).
- Changing the existing React Flow handle-drag connection mechanism (left intact).
