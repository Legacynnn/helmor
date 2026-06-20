# MDX Planning — Design

**Status:** Draft (awaiting user review)
**Date:** 2026-06-20
**Topic:** Experimental `.mdx` planning mode — rich, interactive, locally-rendered plans

## Summary

Add an **experimental toggle** that changes the behavior of the existing plan
mode. When enabled, instead of producing a normal in-thread `plan-review`
message, the agent authors a structured **`.mdx` plan file** under
`.helmor/plans/`. Helmor renders that file as a first-class **interactive Plan
view** — components read from the MDX and rendered with Helmor's existing UI kit.
The user can request changes inline (which flow back to the agent), and once the
plan is ready, hand it off to a fresh agent that picks up the same file and keeps
working on it.

This is inspired by Builder.io's `visual-plan` skill and Agent-Native Plans, but
is **fully local and native to Helmor** — no hosted service, no external bridge.

## Goals

- An experimental setting that, when on, redirects plan mode to emit a `.mdx`
  plan instead of an in-thread plan.
- A beautiful, scannable, interactive Plan view rendered inside Helmor from the
  `.mdx` file.
- A "request changes" loop that sends the user's feedback (anchored to the plan)
  back to an agent to revise the file.
- A "handoff" action that gives a fresh agent the plan and lets it continue
  working on the same living document.

## Non-Goals (deferred)

- Wireframe canvas / interactive clickable prototypes (Agent-Native's
  prototype tab).
- Full runtime MDX evaluation (executing agent-authored JS/JSX).
- `<Diff>`, `<DataModel>`, `<ApiEndpoint>` blocks.
- Pixel/coordinate comment anchoring and detached-comment reconciliation.
- Multi-machine sharing / hosted collaboration.

## Key Decisions (resolved in brainstorming)

1. **Storage: file-based.** The plan is a `.mdx` file at
   `.helmor/plans/<slug>.mdx`. The file is the single canonical source of truth.
   No DB-vs-file content duplication; the DB holds at most a lightweight
   index/pointer (session → plan path + lifecycle status) for listing and UI.
2. **Git: gitignored by default.** `.helmor/plans/` is added to the repo-local
   exclude file (`.git/info/exclude`), the same mechanism `.agent-contexts/`
   uses — so plans never appear in diffs/PRs and we don't have to edit a
   tracked `.gitignore`.
3. **Rendering: AST-mapped MDX, no eval.** Parse the `.mdx` into an MDX syntax
   tree (`remark` + `remark-mdx`), walk it, and render each known JSX element
   against a **fixed allowlist of Helmor components**. Prose nodes render through
   the existing `streamdown` kit. JSX expressions (`{...}`) are inert/ignored.
   Unknown components degrade to a visible placeholder.
   - Rationale: `.mdx`-native authoring feel, **no `unsafe-eval`** (sidesteps any
     Tauri webview CSP constraint and is the safe way to render LLM-authored
     content), reuses the entire existing rendering kit, and each top-level
     component is a natural block for the feedback loop.
4. **Handoff: just a path.** Because the file is canonical and on disk, handoff
   gives a fresh agent the plan path; it reads/edits with normal Read/Edit
   tools. No inlining, no materialization, no sync-back.

## Component Catalog (v1)

The allowlist of blocks the agent may use and Helmor knows how to render:

| Block | Purpose | Implementation |
|---|---|---|
| frontmatter (`title`, `status`, `summary`) | plan identity + lifecycle (`draft` → `approved` → `handed-off`) | new, trivial |
| `<Steps>` / `<Step>` | implementation steps — the spine; each step names what it *reuses* before what it adds | new, simple |
| `<FileMap>` | files the plan will touch (create/modify/delete) | existing `FileTree` |
| `<RiskCard severity>` | severity-marked risk/gotcha callouts | new, simple |
| `<Diagram>` | architecture / data-flow (mermaid) | existing Mermaid pass-through |
| `<AnnotatedCode>` | code snippet with prose annotations | existing `CodeBlock` |
| `<OpenQuestions>` | decision points needing user input — anchor for the feedback loop | new, simple |
| prose | everything else | existing `streamdown` |

Unknown/unsupported components render as a visible placeholder ("unsupported
block: X") rather than failing the whole document.

## Architecture

### Components & responsibilities

1. **Experimental setting** (`src/lib/settings.ts`, settings UI under
   `src/features/settings/`). New optional `AppSettings` flag
   (e.g. `mdxPlanningEnabled`), default `false`, following the established
   add-a-toggle pattern (type, default, key map, load/save).

2. **Plan-mode redirect.** When the toggle is on and plan mode is active, the
   authoring contract handed to the agent instructs it to write a `.mdx` plan
   file (catalog above) under `.helmor/plans/` instead of producing an inline
   plan. The existing `ExitPlanMode` / `plan-review` flow is the integration
   point; in MDX mode the "plan" surfaced to the UI is a reference to the
   written file rather than inline prose.

3. **Plan store (Rust, `src-tauri`).** Commands to create/list/read/write a plan
   file under the workspace `.helmor/plans/`, ensure the gitignore exclude entry,
   and maintain the session→plan index + lifecycle status. Notifications flow
   through `UiMutationEvent` (no ad-hoc emit channels).

4. **MDX renderer (frontend).** `remark` + `remark-mdx` parse → AST walk →
   allowlisted component map. Lives as a focused module (e.g.
   `src/features/plan-viewer/` with the renderer, the component implementations,
   and the surface). Prose delegates to `streamdown`.

5. **Plan view surface.** A dedicated Plan surface opened as its **own
   conversation tab** — alongside the chat thread, NOT inside the Monaco editor.
   This keeps the plan next to the conversation where review/handoff actions
   belong, and makes it a first-class surface rather than "a file you open."
   The surface is a self-contained Plan view with its own toolbar of controls
   (request changes / comment, approve, handoff, status badge) above the
   rendered MDX. It renders the `.mdx`, watches the file for external edits
   (agent revisions), and re-renders. The `.mdx` is still openable raw in Monaco
   as a fallback, but that is not the primary path.

6. **Feedback loop ("request changes").** Per-block comments (top-level
   component = block, with a stable id derived from position/explicit id). On
   submit, comments are serialized into a structured prompt and sent to an
   agent to revise the file. Reuses the existing "Request Changes" plumbing from
   today's plan flow, retargeted to edit the `.mdx`.

7. **Handoff.** An action that spawns / routes to a fresh agent with the plan
   path and a short instruction to treat it as the living plan and keep it
   updated. Sets lifecycle status to `handed-off`. Uses existing agent-spawn
   mechanisms (`helmor-cli` / session launch).

### Data flow

```
Toggle ON + plan mode
  → agent authoring contract: write .helmor/plans/<slug>.mdx (v1 catalog)
  → Rust plan store writes file + ensures gitignore + updates session index
  → UiMutationEvent → frontend invalidates plan query
  → Plan view: read .mdx → remark/remark-mdx AST → allowlist render → interactive plan

Request changes
  → user comments anchored to blocks
  → structured prompt → agent edits .mdx (Edit tool / plan-edit path)
  → file change → Plan view re-renders

Handoff
  → status = handed-off → fresh agent gets plan path → continues editing same file
```

### Error handling

- Parse failure: show a graceful error in the Plan view with a "view raw" /
  open-in-editor fallback (the file always opens in Monaco as `.mdx`).
- Unknown component: visible placeholder, rest of document renders.
- Missing/renamed file: Plan view shows an empty/again-create state.
- Gitignore exclude write failure: log + non-fatal (plan still works, may show
  in git status).

## Testing

- **Rust:** plan store commands (create/list/read/write, gitignore exclusion,
  session index + lifecycle). Any persistence/pipeline touchpoints get snapshot
  coverage per repo rules.
- **Frontend:** MDX renderer unit tests — each allowlisted block renders;
  unknown component → placeholder; parse error → fallback; frontmatter →
  lifecycle. Plan view interaction tests for the comment/feedback affordance.
- **Settings:** toggle persists and gates the redirect.

## Open Questions (for implementation-plan stage)

- Plan view mounting: **decided** — opens as its own conversation tab (not the
  editor). Implementation detail to finalize: how a new tab *kind* is added to
  the conversation tab system and how it carries the plan path + lifecycle.
- Plan slug/naming: derived from session title vs explicit.
- Whether "request changes" reuses the current session's agent or always spawns
  a dedicated revision agent.
- Exact authoring-contract wording given to the agent (the prompt/skill that
  teaches the v1 catalog).
```
