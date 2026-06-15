# Semantic (Conventional Commits) Branch Prefix — Design

**Date:** 2026-06-14
**Status:** Approved (design)

## Problem

Helmor lets each repo pick how generated workspace branches are prefixed. Today there
are three modes (`src-tauri/src/models/settings.rs::BranchPrefixType`):

- **Username** — `alice/tokyo` (forge login + celestial directory name)
- **Custom** — `feat/tokyo` (a *static* literal string the user types)
- **None** — `tokyo`

Users want a prefix that is **standardized by what the change actually is** —
`feat/`, `fix/`, `refactor/`, `chore/`, etc. — with **no nickname and no static
literal**. The type should be chosen automatically per workspace based on the work
being done, not typed by hand and not fixed across all branches.

## Decisions (locked during brainstorming)

1. **Type source:** the LLM auto-classifies. No manual picker, no override UI.
2. **Type set:** the full Conventional Commits set —
   `feat, fix, refactor, chore, docs, test, perf, style, build, ci`.
   Anything ambiguous/unrecognized falls back to `chore`.
3. **Pre-prompt naming:** before the first prompt classifies the change, the branch
   is the **bare celestial slug** (`tokyo`) — no guessed prefix. It renames to
   `<type>/<slug>` once the first prompt is classified.
4. **Type transport:** Approach A — the type is a **separate field** end-to-end
   (not embedded in the slug), so it never passes through the slug-sanitizing regex
   that strips `/`.

## How branch naming works today (context)

- A workspace is created with a celestial directory name (e.g. `tokyo`) **before** any
  prompt exists. `workspace/lifecycle.rs` calls
  `helpers::branch_name_for_directory(directory_name, &branch_settings)` to build the
  initial branch name from the configured prefix.
- On the **first prompt**, `agents/queries.rs::generate_session_title` asks the LLM
  (local LLM first via `local_llm/title.rs`, else the sidecar cloud path via
  `sidecar/src/title.ts`) for a session **title** and a branch **slug**. It then
  renames the branch from `<prefix>tokyo` → `<prefix><slug>` using
  `branch_name_for_directory(branch_segment, &branch_settings)`.
- The branch-prefix mode is persisted per repo in the `repos.branch_prefix_type`
  column (free-form text) plus `branch_prefix_custom`. Loaded by
  `models/repos.rs::load_repo_branch_prefix_settings` into
  `EffectiveBranchPrefixSettings`.

The first-prompt rename is the natural place to apply the auto-detected type: the LLM
already runs there with enough context to classify the change.

## Design

### 1. Settings model — `src-tauri/src/models/settings.rs`

- Add `BranchPrefixType::Semantic`, serialized as `"semantic"`.
- No DB migration: `branch_prefix_type` is free-form text, so `"semantic"` is just a
  new accepted value. NULL/unknown continue to resolve to `Username` (unchanged).

### 2. Prefix application — `src-tauri/src/workspace/helpers.rs`

- `branch_name_for_directory` gains an optional `semantic_type: Option<&str>` argument.
  - Mode `Semantic` + `Some("fix")` → `fix/<slug>`.
  - Mode `Semantic` + `None` → bare `<slug>` (creation / pre-prompt window — decision 3).
  - All other modes ignore `semantic_type` and behave exactly as today.
- Update all existing callers (`workspace/lifecycle.rs`, `workspace/branching.rs`,
  `agents/queries.rs`, `triage/workspace_factory.rs`, `is_*` helper predicates) to
  pass `None`, except the first-prompt rename in `agents/queries.rs`, which passes the
  detected type.

### 3. Type generation — sidecar + local LLM

Only request the type when the repo is in Semantic mode (avoid wasting tokens otherwise).

- **`sidecar/src/title.ts`**
  - `buildTitlePrompt` gains the Semantic-mode instruction: *"Also output a `type:`
    line — one of: feat, fix, refactor, chore, docs, test, perf, style, build, ci —
    chosen from the nature of the change. If unsure, use chore."*
  - `parseTitleAndBranch` parses the `type:` line, lower-cases it, validates against
    the allowed set, and defaults to `chore` when missing/unrecognized. Returns the
    type as a new field on the result object.
  - `request-parser.ts` / `session-manager.ts` (`GenerateTitleOptions`) carry a new
    flag indicating Semantic mode (analogous to `generateBranch`); `emitter.ts`
    includes the type in the emitted result.
- **`src-tauri/src/local_llm/title.rs`**
  - Mirror the prompt addition and parsing. `generate_title` returns a third value
    (the optional type). `build_title_prompt` / `parse_title_response` updated
    accordingly.

### 4. Plumbing — `src-tauri/src/agents/queries.rs`

- Determine Semantic mode from `branch_settings.branch_prefix_type` and pass the flag
  into both title-generation paths (local and sidecar JSON params).
- Receive the detected type alongside `generated_branch`.
- At the rename step, call
  `branch_name_for_directory(branch_segment, &branch_settings, semantic_type)`.
- The type is only meaningful in Semantic mode; in all other modes it is `None`/ignored.

### 5. Frontend — `src/features/settings/panels/repository-settings/branch-prefix-section.tsx`

- Add a 4th radio option: **"Semantic (Conventional Commits)"**.
- Live preview shows `fix/<slug>` (illustrative) with helper text:
  *"The type (feat / fix / refactor / chore …) is detected automatically from your
  first prompt. No prefix until then."*
- Selecting it calls the existing `updateRepositoryBranchPrefix(repoId, "semantic",
  null)` (custom value cleared, like the None/Username branches).
- Thread `"semantic"` as a valid type string through `src/lib/api.ts` and
  `src-tauri/src/commands/repository_commands.rs` (and the CLI surface in
  `src-tauri/src/cli/settings.rs` if it enumerates the modes).

### 6. Testing

- **Rust unit tests** (`workspace/helpers.rs`): `branch_name_for_directory` in Semantic
  mode — with a type (`fix/slug`), without a type (bare `slug`), and confirming other
  modes ignore the new argument.
- **Sidecar `bun test`** (`title.test.ts`): the new parse path — a valid `type:` line,
  an unknown type → `chore`, and a missing `type:` line → `chore`; confirm the
  slug/title parsing is unchanged.
- **Settings round-trip** (Rust command test): persisting and loading `"semantic"`
  yields `BranchPrefixType::Semantic` with a cleared custom value.
- Pipeline snapshot tests are **unaffected** — no `session_messages` storage-shape
  change. (Verify by running `cd src-tauri && cargo test --tests` regardless.)

## Out of scope (YAGNI)

- Per-type customization or remapping of the type set.
- A manual override / type-picker UI.
- Conventional-commit scope notation (e.g. `feat(api)/…`).
- Re-classifying the type on later prompts (type is set once, at the first-prompt
  rename, same as the slug today).

## Risk notes

- The `/` separator must never flow through the branch-slug sanitizer
  (`BRANCH_INVALID_RE = /[^a-z0-9-]/g`), which strips it. Keeping the type a separate
  field (decision 4 / Approach A) avoids this entirely.
- Two LLM paths (local + sidecar) must stay in sync on the prompt and parsing rules;
  both get the same allowed-set + `chore` fallback so behavior is identical regardless
  of which path produced the title.
