# Plan 010: Write the pipeline & storage architecture decision record

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `ls docs/architecture/ 2>/dev/null` — if a
> pipeline/storage doc already exists, reconcile with it instead of writing a
> duplicate.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (docs only)
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `2818226c`, 2026-06-11

## Why this matters

The message pipeline (`src-tauri/src/pipeline/`) and the
`session_messages.content` storage shape are Helmor's most constrained
subsystem: thousands of lines of insta snapshot tests pin the contract, and
CLAUDE.md carries a 🚨 rule that any change there needs snapshot coverage.
But the *why* lives nowhere: why the accumulator APPENDs Claude's delta
blocks, why normalization happens in Rust rather than the sidecar, what a new
provider integration must implement, and why SQLite still runs with
`foreign_keys` OFF (`src-tauri/src/models/db.rs:90` —
`// TODO(tech-debt): enable foreign_keys=ON once an orphan-cleanup migration lands.`
— a blocker with no owner or tracking). Each recently-added provider (OpenCode,
Cursor) re-derived this from snapshot diffs. One page of ADR turns that
archaeology into reading.

## Current state

- `src-tauri/src/pipeline/` — `accumulator/`, `adapter/`, `collapse`,
  `event_filter.rs`, `classify.rs`, `types.rs`.
- The two converging paths (from CLAUDE.md "Message data flow"): live
  streaming (sidecar events → accumulator → adapter+collapse) and historical
  reload (DB rows → convert_historical → same adapter+collapse), meeting at
  `IntermediateMessage[]`.
- Storage shape (CLAUDE.md "Storage shape"): `session_messages.content` is
  JSON, discriminated by top-level `type` (`user_prompt`, `user`, `assistant`,
  `system`, `error`, `result`, `item.completed`, `turn.completed`); DB stores
  post-accumulator form.
- Tests: `src-tauri/tests/pipeline_scenarios.rs` (70+ handcrafted),
  `pipeline_fixtures.rs` (real sessions, insta glob),
  `pipeline_streams.rs` (raw SDK JSONL, three-stage round-trip).
- The foreign-keys blocker: `src-tauri/src/models/db.rs:90` (quoted above).
- `docs/` today: `cli-and-mcp.md`, `local-release.md`, `release-secrets.md`,
  `perf/`, `superpowers/` — no architecture docs, no `docs/architecture/`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Confirm claims against tests | `cd src-tauri && cargo test --tests` | all pass (read-only sanity; run once) |

## Scope

**In scope**:
- `docs/architecture/pipeline-storage.md` (create)
- `CLAUDE.md` — one pointer line from the "Message data flow" section to the
  new doc

**Out of scope**:
- Any code change, including the foreign_keys TODO itself.
- Rewriting CLAUDE.md content (it stays the operational summary; the ADR is
  the rationale).

## Git workflow

- Branch: `advisor/010-pipeline-adr`
- Conventional commit: `docs(architecture): pipeline & storage ADR`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read the subsystem

Read `src-tauri/src/pipeline/types.rs`, the `accumulator/` and `adapter/`
module entry points, `agents/persistence` (how rows are written), and skim
one fixture in `src-tauri/tests/fixtures/pipeline/` and one stream JSONL in
`tests/fixtures/streams/`. Read git log for the pipeline
(`git log --oneline -15 -- src-tauri/src/pipeline/`) to capture recent
decisions.

**Verify**: you can answer, from code: (a) where exactly delta-append happens,
(b) which component decides `type`, (c) what `convert_historical` shares with
the live path.

### Step 2: Write the ADR

`docs/architecture/pipeline-storage.md`, ~1-2 pages, sections:

1. **Context** — three processes, two SDK event dialects (+ OpenCode/Cursor),
   one UI message shape.
2. **Decision: accumulate in Rust, store post-accumulator** — why deltas are
   appended in the Rust accumulator (not the sidecar, not the frontend), and
   why the DB stores the accumulated form. Derive the rationale from code and
   git history; where you must infer, mark it "(inferred)" — do not present
   guesses as recorded decisions.
3. **Decision: shared adapter+collapse for live and historical** — the
   convergence at `IntermediateMessage[]` and what invariant it buys.
4. **The storage contract** — the `type` discriminants table, with one
   real example row per major type (copy from a fixture, redact any personal
   content).
5. **Adding a provider** — the checklist implied by the OpenCode/Cursor
   additions: what to emit, what the accumulator expects, which snapshot
   targets must gain fixtures (`gen_pipeline_fixture` usage from CLAUDE.md).
6. **Known constraints / debt** — `foreign_keys=OFF` with the db.rs:90 quote,
   what the orphan-cleanup migration must do before flipping it, and a named
   follow-up (file an issue or plans/ entry — reference, don't create).
7. **How to change this safely** — snapshot-test workflow (review diffs,
   `cargo insta review`), the CLAUDE.md 🚨 rule.

**Verify**: every factual claim in sections 2-6 carries a `file:line` or test
citation; "(inferred)" marks are present where applicable.

### Step 3: Cross-link

Add one line to CLAUDE.md's pipeline section: rationale lives in
`docs/architecture/pipeline-storage.md`.

**Verify**: `grep -n "pipeline-storage" CLAUDE.md` → 1 match.

## Test plan

None (docs). The Step 2 citation check is the quality gate.

## Done criteria

- [ ] `docs/architecture/pipeline-storage.md` exists with all 7 sections
- [ ] Every decision section cites code/tests; inferences are marked
- [ ] CLAUDE.md links the doc
- [ ] `git diff --stat` touches only the new doc and CLAUDE.md

## STOP conditions

- The accumulator/adapter structure no longer matches CLAUDE.md's description
  (subsystem refactored since planning) — report before documenting.
- You cannot determine the append rationale from code/history and would have
  to invent it wholesale — write the doc with the section marked "OPEN
  QUESTION for maintainer" rather than fabricating.

## Maintenance notes

- The ADR goes stale exactly when a new provider lands or the storage shape
  gains a discriminant — reviewers of such PRs should require an ADR delta.
