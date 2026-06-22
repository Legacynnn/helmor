# Rich Plan Components v2 — Design

**Status:** Draft (awaiting user review)
**Date:** 2026-06-21
**Topic:** A richer, more expressive MDX plan component vocabulary, a shared visual
language for old + new components, and enriched infinity-canvas node kinds.

## Summary

The v1 MDX plan catalog (`RiskCard`, `Steps`, `FileMap`, `OpenQuestions`,
`AnnotatedCode`, `Diagram`, `PlanCanvas`/`CanvasNode`) works, but the components
feel flat and "raw" — each is a thin callout box with ad-hoc styling, and the
vocabulary can't express the things plans actually need: prototypes, option
trade-offs, before/after comparisons, schemas, and phased timelines.

This round does three things:

1. **A shared visual language** (`PlanBlockShell` + an accent system + plan-scoped
   tokens) that every block — old and new — sits on, so the whole plan feels
   cohesive and premium instead of a pile of inconsistent boxes.
2. **Seven new components** — `Wireframe`, `MultiPrototype`, `BeforeAfter`,
   `Decision`, `Diff`, `DataModel`, `Timeline` — that make plans genuinely
   expressive.
3. **Canvas enrichment** — `CanvasNode` gains *kinds* (`note`, `resume`,
   `option`, `phase`, `wireframe`) and variable sizing, so the infinity canvas
   delivers the original "floating connected boxes representing a lot of things"
   vision (quick resume, options at a glance, prototype thumbnails).

It stays inside the existing architecture: AST-mapped MDX against a fixed
allowlist, **no eval**, prose through `streamdown`, unknown components degrade to
a placeholder.

## Goals

- A single shared shell primitive that unifies the look of all plan blocks.
- Restyle the five existing prose/raw components onto the shell (visual upgrade
  only — no authoring/vocabulary changes for them).
- Add seven new components with reliable, LLM-authorable shapes.
- Enrich the canvas with node kinds + variable sizing so it can hold
  resume/option/phase/wireframe boxes.
- Keep the **triple-sync** (registry ↔ component ↔ agent authoring contract) in
  lockstep, with a worked example per new component.
- Test coverage for every new parser child mode, component render, and canvas
  node kind.

## Non-Goals (deferred)

- Live/interactive (clickable, runnable) prototypes — wireframes are **static**
  low-fidelity mockups this round.
- Runtime MDX evaluation / executing agent-authored JS.
- Generated or captured screenshot images inside prototypes.
- Drag-to-reposition persistence on the canvas (layout stays dagre-computed).
- `ApiEndpoint` and other catalog items not listed above.
- Pixel/coordinate comment anchoring changes.

## Key Decisions (resolved in brainstorming)

1. **Two-tier placement: canvas = map, blocks = detail.** Width-hungry,
   read-linearly components (`Wireframe`, `MultiPrototype`, `BeforeAfter`,
   `Diff`, `DataModel`, `Timeline`) render full-width in the document flow. The
   canvas stays the high-level overview surface; it gains richer node *kinds*
   that can summarize and (optionally) deep-link to a detail block below.
   - Rationale: a code diff or schema crammed into a ~220px canvas node reads
     terribly, and heavy interactive content inside a pan/zoom surface fights the
     scroll. Each component should be good at exactly one job.
2. **Shared shell first.** Build `PlanBlockShell` + accent system + tokens as the
   foundation and migrate the existing five onto it before adding new ones, so
   every component (old and new) is consistent by construction.
3. **Prototypes are static wireframes + variant comparison.** A `Wireframe` is a
   declarative low-fi mockup; `MultiPrototype` is a tabbed shell comparing 2–4
   labeled variants with an optional "recommended" badge.
4. **Wireframe uses a constrained line-DSL.** Children are raw text, one element
   per line, indentation = nesting, from a small fixed primitive set
   (`row`, `col`, `box`, `input`, `button`, `text`, `image`, `divider`). Chosen
   over free JSX nesting because a tight grammar is far more reliable for an LLM
   to emit and trivial to parse/degrade.
5. **Nested-structured components mirror PlanCanvas/CanvasNode.** `Decision` →
   `Option`, `MultiPrototype` → `Variant`, `DataModel` → `Entity`, `Timeline` →
   `Phase`, `BeforeAfter`/`Diff` → `Before`/`After` all use the existing
   `structured` child mode so the parser already supports them.
6. **One spec, three waves.** The scope is large but cohesive (everything depends
   on the shared shell), so it stays one spec, sequenced into three
   independently-shippable waves.

## Architecture

### Shared visual language

`src/features/plan-viewer/components/shell/` (new):

- `plan-block-shell.tsx` — `PlanBlockShell` primitive: optional header row
  (`icon`, `title`, `accent`, trailing `badge`/status chip), body slot,
  consistent padding/radius/divider. Every block composes this.
- `accent.ts` — single source mapping semantic intent → token classes
  (`risk:low|medium|high`, `decision:recommended`, `phase:done|active|todo`,
  `diff:add|remove`, `neutral`, …). Replaces today's inline color strings.
- `tokens.ts` (or a Tailwind layer) — plan-scoped spacing/radius/density
  constants so all blocks share rhythm.

Existing components (`risk-card`, `steps`, `file-map`, `open-questions`,
`annotated-code`) are refactored to render through `PlanBlockShell` + `accent`.
Their MDX vocabulary and props are unchanged — purely a visual/internal refactor.

### New components

All live under `src/features/plan-viewer/components/` (each its own file or
folder when it has sub-parts), composed from `PlanBlockShell`:

- **`Wireframe`** (`raw`): parses the line-DSL into a tree, renders nested
  gray-box primitives with labels. Pure render of a parsed mini-grammar.
  - `wireframe/parse-wireframe.ts` (pure, tested) + `wireframe/index.tsx`.
- **`MultiPrototype`** (`structured`) + **`Variant`**: extracts `Variant`
  children, renders a segmented/tab header (with "recommended" badge) and shows
  the active variant's blocks (typically a `Wireframe`).
- **`BeforeAfter`** (`structured`) + **`Before`**/**`After`**: two labeled
  panels of blocks, side-by-side on wide, stacked on narrow.
- **`Decision`** (`structured`) + **`Option`**: option cards with title +
  pros/cons markdown; the `recommended` option is accent-highlighted.
- **`Diff`** (`raw` or `structured`): unified or split before/after code with
  add/remove gutters and `lang` syntax highlighting. Reuses `CodeBlock`.
- **`DataModel`** (`structured`) + **`Entity`**: typed entity tables
  (`field: type` lines) + relationship hints between entities.
- **`Timeline`** (`structured`) + **`Phase`**: sequential phase track with
  connectors and a `status` chip per phase.

### Canvas enrichment

`src/features/plan-viewer/components/canvas/`:

- `CanvasNode` gains an optional `kind` prop
  (`note` default | `resume` | `option` | `phase` | `wireframe`).
- `canvas-node.tsx` renders per-kind styling via the shared `accent` system;
  `resume` is a wider summary card, `wireframe` shows a compact mockup
  thumbnail.
- `build-graph.ts` carries `kind` into node `data`; `layout.ts` supports
  variable node sizing (per-kind nominal width/height) instead of the fixed
  220×96.

### Triple-sync (per new component)

1. `src/features/plan-viewer/mdx/registry.tsx` — add to allowlist with its child
   mode; register sub-components (`Variant`, `Option`, `Entity`, `Phase`,
   `Before`, `After`).
2. The React component file(s) above.
3. `MDX_PLAN_AUTHORING_BLOCK` in `src-tauri/src/agents/system_prompt.rs` — add
   the tag, prop rules, and a short worked example so the agent emits it. Keep
   the SYNC-WITH contract intact.

## Data flow

Unchanged from v1: `.mdx` file → `mdx/parse.ts` (frontmatter + block tree, child
mode from registry) → `render-blocks.tsx` dispatch → component. New
nested-structured components receive parsed `PlanBlock[]` children and extract
their typed sub-components exactly like `PlanCanvas` extracts `CanvasNode`.

## Error handling

- Unknown components / sub-components → existing `UnsupportedBlock` placeholder.
- Malformed `Wireframe` lines → skipped with a subtle inline marker, never throw.
- `Decision`/`MultiPrototype` with no valid children → shell renders with an
  empty-state hint rather than crashing.
- All new components sit under the existing `plan-error-boundary`.

## Testing

- `mdx/parse.test.ts` — child-mode + nesting cases for each new component.
- `wireframe/parse-wireframe.test.ts` — DSL grammar (nesting, unknown tokens,
  empty).
- Vitest render test per component (props, recommended/active states, degrade).
- `canvas/build-graph.test.ts` + `layout.test.ts` — node kinds + variable sizing.
- Run any snapshot suite touching `system_prompt.rs`
  (`cd src-tauri && cargo test`) after the authoring-contract edits.

## Sequencing (3 waves, one spec)

1. **Wave 1 — Foundation:** `PlanBlockShell`, `accent`, tokens; migrate the five
   existing components; no new vocabulary. Ship + eyeball.
2. **Wave 2 — Decision support:** `Decision`, `BeforeAfter`, `Diff`, `Timeline`
   (+ their sub-components, registry, authoring contract, tests).
3. **Wave 3 — Prototyping + canvas:** `Wireframe`, `MultiPrototype`/`Variant`,
   `DataModel`/`Entity`, then `CanvasNode` kinds + variable sizing.

Each wave is independently shippable and keeps the triple-sync consistent.
