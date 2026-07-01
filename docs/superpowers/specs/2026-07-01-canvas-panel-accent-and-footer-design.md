# Canvas panel accent border + per-type footer

**Date:** 2026-07-01
**Status:** Approved (design)
**Area:** `src/features/canvas/`

## Problem

Canvas panels (`PanelNode`) all look identical: a neutral rounded border, a
header (icon + title + connections + close), and a body. There is no
type-at-a-glance identity and no footer surfacing per-panel status. Users want
(1) a per-type identity color on the panel chrome and (2) a footer per panel
type carrying type-appropriate information — with the conversation panel getting
a richer, custom footer.

## Goals

- Give each `CanvasPanelType` a persistent identity color, shown as a thin
  accent bar framing the panel body (header bottom divider + footer top divider).
- Add a footer to **every** panel type, each with type-appropriate content.
- Give the **conversation** panel a custom footer: live status + streaming, git
  branch, and last-activity relative time.
- No backend/IPC/pipeline/persistence changes — reuse existing React Query data.

## Non-goals

- No changes to the split-canvas / pane-tree branch.
- No per-type border tinting or left-edge stripe (explicitly rejected in favor
  of the accent-bar treatment).
- No new session/status data plumbing; footers read only what hooks already
  expose.

## Decisions (from brainstorming)

- **Border treatment:** keep the neutral rounded border. Type color appears as a
  **colored accent bar** = the header's bottom divider and the footer's top
  divider, both recolored to the type accent. Result: the body is framed top and
  bottom in the type color.
- **When colored:** always show (persistent), so unfocused panels stay
  identifiable. Selection keeps its existing amber dashed outline, independent of
  accent.
- **Footer scope:** all panel types.
- **Conversation footer content:** status + streaming, git branch, last activity.

## Design

### 1. Type identity colors — `chrome/panel-accent.ts`

A `PANEL_ACCENT: Record<CanvasPanelType, string>` map of oklch colors, chosen at
a calm chroma so they read as identity, not alarm, and stay legible on both the
cream (light) and near-black (dark) panel surfaces:

| Type | Accent (hue family) |
|---|---|
| conversation | blue |
| git | orange |
| terminal | green |
| editor | indigo |
| file-manager | teal |
| notes | amber |
| drawing | violet |
| placeholder | neutral gray |

Helper `accentDivider(type)` returns the color string used for the header
bottom border and footer top border. Values are plain oklch literals (matching
the panel's existing inline-style approach) so they always resolve even before
custom properties hot-load.

### 2. Footer shell + dispatcher — `chrome/panel-footer.tsx`

`PanelFooter` mirrors the existing `PanelBody` switch in `panel-node.tsx`,
routing by `panelType` to a per-type footer body. A shared `FooterShell`
provides the common chrome:

- Height ~`h-6`, `text-[11px]`, muted foreground, single flex row, `px-2.5`,
  `gap-2`, items truncate.
- Top border colored with `accentDivider(type)`.
- Background honors translucency with the same legibility floor the header uses
  (`max(alpha, 0.55)` via the existing `surface()` helper), so the footer never
  dissolves on own-surface panels (conversation, terminal).
- `nodrag` so footer controls/links don't start a panel move.

Default per-type content:

- **terminal** — shell name + running/exited state
- **editor** — file name + language + dirty dot
- **file-manager** — current subpath + item count
- **git** — branch + N changed files
- **notes** — word count · last edited
- **drawing** — shape count
- **placeholder** — type label only

Each lives in its own file under `chrome/footers/` (one responsibility per file,
per repo rules). Types with thin data render a minimal label — the footer is
always present for visual consistency but never invents data.

### 3. Conversation footer — `chrome/footers/conversation-footer.tsx`

Left → right:

1. **Status pill** — idle / thinking / streaming, with a pulsing dot while the
   agent is actively working.
2. **Git branch** — branch icon + branch name (truncates).
3. **Last activity** — relative time (e.g. "2m ago").

Data sources (existing React Query hooks, no new IPC):

- Session summary → `status`, `lastUserMessageAt`.
- Active-streams summary → streaming flag for this `sessionId`.
- Workspace detail → `branch`.

Streaming flag takes precedence over `status` for the pill label. The relative
time formats from `lastUserMessageAt`.

### 4. `panel-node.tsx` integration

- Apply `accentDivider(data.panelType)` to the header's `borderBottomColor`
  (replacing the current color-mix derivation for the divider only).
- Render `<PanelFooter panelType=… config=… nodeId=… />` immediately after the
  body div, inside the same flex column, wrapped in the existing
  `PanelErrorBoundary` pattern.
- Keep additions minimal (single component call + one style change); the accent
  map and footer components are new files, so `panel-node.tsx` grows only
  slightly.

## File plan

New:

- `src/features/canvas/chrome/panel-accent.ts`
- `src/features/canvas/chrome/panel-footer.tsx`
- `src/features/canvas/chrome/footers/conversation-footer.tsx`
- `src/features/canvas/chrome/footers/{terminal,editor,files,git,notes,drawing}-footer.tsx`

Modified:

- `src/features/canvas/panel-node.tsx` (accent divider + footer render)

## Testing (vitest + jsdom, co-located)

- `panel-accent.test.ts` — every `CanvasPanelType` has an accent color (map
  completeness), guarding against a new type shipping without one.
- `conversation-footer.test.tsx` — status/streaming label precedence and
  relative-time formatting from fixture data.
- `panel-footer.test.tsx` — the correct footer body renders for each panel type.

No pipeline / persistence / schema changes, so **no snapshot tests required**.

## Risks / edge cases

- **Translucency:** footer must honor the same alpha floor as the header, or it
  dissolves on conversation/terminal panels. Covered by reusing `surface()`.
- **Missing data:** unbound conversation (no `sessionId`) or a workspace without
  a branch — footer renders a graceful minimal state, never throws (guarded by
  `PanelErrorBoundary`).
- **Accent legibility:** colors must be visible on both themes; validated
  visually against light (cream) and dark (near-black) surfaces.
- **Height budget:** ~24px footer reduces body height; acceptable and consistent
  with the existing 36px header.
