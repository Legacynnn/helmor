# PlanCanvas — Design

**Date:** 2026-06-21
**Status:** Approved (brainstorming) — pending implementation plan
**Scope:** A new interactive mind-map component for MDX plans (`src/features/plan-viewer/`)

## Summary

Add `<PlanCanvas>`, a bounded, smooth, pan/zoom **mind-map** component that the agent
places at the top of a plan to show how the task's pieces connect. The agent authors the
graph (nodes + connections); the canvas auto-lays-it-out; the user drags / pans / zooms to
explore. Layout interactions are **ephemeral** — they reset to the agent's authored layout
on reload. This is the first of a planned family of richer plan components; later additions
(prototype nodes, "multiple prototyping", persisted layouts, drill-down) are explicitly out
of scope here.

The feature is **frontend-only**: no Rust, no watcher changes, no DB/storage-shape changes,
and therefore no pipeline snapshot work.

## Decisions (from brainstorming)

1. **Authoring model:** the agent writes only the *graph* (nodes + which connects to
   which). Layout is automatic. (Not explicit coordinates; not persisted user layout.)
2. **Node content:** free-form, mind-map style. Nodes hold arbitrary short plan content
   (prose / lists). No rigid node taxonomy. A `kind` styling hint is reserved but unused
   in v1.
3. **Relationship to the plan:** the canvas is a **standalone plan block**, always rendered
   first in a plan. It is an overview of how pieces connect, not the whole plan body.
4. **Sizing & feel:** bounded viewport (not full-screen); fluid pan/drag/zoom is a
   first-class requirement.
5. **Persistence:** ephemeral. User drag/pan/zoom is exploration only; it snaps back to the
   agent's layout on reload. No backend writes.
6. **Rendering tech:** `@xyflow/react` (React Flow) + `@dagrejs/dagre` for auto-layout,
   with fully custom Helmor-styled nodes/edges. (Not hand-built; not a micro-lib.)

## Authoring shape

Reuses the existing nested-block machinery in `mdx/parse.ts` — no parser changes, just two
new registered components (`childMode: "blocks"` for both):

```mdx
<PlanCanvas direction="TB">
  <CanvasNode id="overview" title="Goal" connects="auth,ui">
    Add SSO login across the app.
  </CanvasNode>
  <CanvasNode id="auth" title="Auth layer" connects="db">
    - OAuth provider
    - Token refresh
  </CanvasNode>
  <CanvasNode id="db" title="Schema" />
  <CanvasNode id="ui" title="Login UI" />
</PlanCanvas>
```

- `CanvasNode` body = normal plan blocks (short prose / lists). Rendered compact with a
  max-height and internal scroll.
- `connects="a,b"` (comma-separated target ids) builds the edges. Targets that don't
  resolve to a node id are dropped silently.
- `direction="TB|LR"` selects layout flow. Default `TB`.
- `id` is required for a node to be a connection target. Nodes without `id` still render but
  cannot be referenced.

## Architecture

### Rendering
- `@xyflow/react` + `@dagrejs/dagre`, **lazy-loaded** behind a boundary (same pattern as
  Monaco via `lib/monaco-runtime.ts` and Streamdown in `plan-markdown.tsx`) so it never
  bloats the initial bundle.
- **Custom node + edge** components styled entirely with Helmor tokens (`bg-app-*`, rounded
  card, title header, `cursor-pointer`, selection ring). No React Flow default chrome.
- Bounded viewport (~440–480px tall), dotted background, `fitView` on mount, subtle zoom
  controls. No minimap in v1.

### Data flow
```
.mdx → parse.ts (existing) → block tree
     → PlanCanvas block (children = CanvasNode blocks)
     → build-graph.ts: blocks → { nodes, edges }
     → layout.ts (dagre): assign positions
     → React Flow renders custom nodes/edges
```

### Interaction
- Pan (drag background), zoom (scroll/pinch + buttons), drag nodes (ephemeral).
- Click a node → highlight it + its edges/neighbors, dim the rest. Smooth transitions.
- The canvas is a single plan block, so it stays compatible with the existing plan-view
  block-comment / "request changes" flow.

## Files

| File | Role |
| --- | --- |
| `src/features/plan-viewer/components/canvas/index.tsx` | Lazy boundary + `PlanCanvas` entry |
| `src/features/plan-viewer/components/canvas/plan-canvas.tsx` | React Flow surface |
| `src/features/plan-viewer/components/canvas/canvas-node.tsx` | Custom Helmor-styled node |
| `src/features/plan-viewer/components/canvas/build-graph.ts` | Blocks → `{ nodes, edges }` |
| `src/features/plan-viewer/components/canvas/layout.ts` | Dagre wrapper (positions) |
| `src/features/plan-viewer/mdx/registry.tsx` | Register `PlanCanvas` + `CanvasNode` |
| `package.json` | Add `@xyflow/react`, `@dagrejs/dagre` |
| (agent authoring docs) | Document `PlanCanvas` so the agent authors it first |

## Testing

- Unit-test `build-graph.ts`: attributes → nodes, `connects` → edges, dangling-edge drop,
  layout assigns positions, missing-`id` handling.
- Component test with React Flow mocked: asserts correct nodes/edges are handed in.
- No backend / pipeline / snapshot changes.

## Out of scope (future)

- Persisted layouts (writing positions back to `.mdx` / sidecar).
- Prototype nodes and "multiple prototyping".
- Drill-down from a node to a linear plan section.
- Minimap.
- The reserved `kind` styling hint (parsed-tolerant but unused).

## Open items to resolve during planning

- Locate the agent-facing plan-authoring instructions (system prompt / skill / store
  boilerplate) that must learn about `PlanCanvas`.
- Confirm `@xyflow/react` pan/zoom behaves inside the bounded plan viewport (expected to —
  it is pure DOM/SVG, unrelated to the native-webview split-canvas occlusion concerns).
