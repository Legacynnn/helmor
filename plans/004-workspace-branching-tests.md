# Plan 004: Characterization tests for `workspace/branching.rs`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2818226c..HEAD -- src-tauri/src/workspace/branching.rs src-tauri/src/testkit.rs`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW — tests only.
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `2818226c`, 2026-06-11

## Why this matters

`src-tauri/src/workspace/branching.rs` (753 lines) implements branch listing,
renaming, target-branch retargeting/realignment, remote sync, push, and
"continue from target branch" — the logic on the workspace-creation and
PR-flow critical paths. It has **zero `#[test]` functions** while churning
actively (recent feature work touches workspace lifecycle constantly). By
contrast, its main collaborator `git/ops.rs` has 29 tests. An untested,
high-churn module on a data-loss-capable path (it moves branches and resets
worktrees) is the repo's top refactor risk. Characterization tests make every
future change to this file reviewable.

## Current state

- `src-tauri/src/workspace/branching.rs` — public surface at `2818226c`:
  - `list_remote_branches(workspace_id, repo_id)` (line 51) — resolves repo
    context from the DB, then delegates to `git_ops`.
  - `list_branch_picker_entries(repo_root: &Path, remote: &str)` (line 71) —
    pure local-fs merge of local+remote branches into
    `{name, has_local, has_remote}` rows, sorted. **No DB. Easiest target.**
  - `rename_workspace_branch(workspace_id, new_branch)` (line 115)
  - `update_intended_target_branch(...)` (159) /
    `update_intended_target_branch_local(...)` (186)
  - `refresh_remote_and_realign(...)` (280), `prefetch_remote_refs(...)` (383)
  - `sync_workspace_with_target_branch(...)` (425)
  - `push_workspace_to_remote(workspace_id)` (554)
  - `continue_workspace_from_target_branch(...)` (598)
  - Private: `resolve_repo_context` (27), `try_realign_local_branch` (229),
    `rollback_continue_branch` (715); plus a prefetch rate-limit map (339)
    with test hook `_reset_prefetch_rate_limit()` (749).

- **The repo has a purpose-built test harness** — `src-tauri/src/testkit.rs`:
  `TestEnv` (isolated `HELMOR_DATA_DIR` tempdir + SQLite schema + pools, holds
  a global env lock), `GitTestRepo` (temp git repos), and DB fixture helpers
  `insert_repo` / `insert_workspace` / `WorkspaceFixture`. Exemplar usage:
  `src-tauri/src/workspace/workspaces.rs:1671`
  (`use crate::testkit::{insert_repo, insert_workspace, TestEnv, WorkspaceFixture};`)
  and `src-tauri/src/workspace/helpers.rs:989`.

- Git-fixture pattern (if `GitTestRepo` lacks something): `git/ops.rs:1513`
  `init_repo()` builds a tempdir repo with `git init`, a `main` branch, test
  identity, `commit.gpgsign false`, one commit; `init_repo_with_remote()`
  (ops.rs:1712) pairs it with a clone. Mirror these rather than inventing
  a new harness.

- Test module convention: `#[cfg(test)] mod tests { use super::*; ... }` at
  the bottom of the source file (see `workspace/port_allocation.rs:125`).

## Commands you will need

| Purpose    | Command                                                       | Expected on success |
|------------|---------------------------------------------------------------|---------------------|
| Lib tests  | `cd src-tauri && cargo test --lib workspace::branching`      | all pass            |
| Full tests | `cd src-tauri && cargo test`                                  | all pass            |
| Lint       | `cd src-tauri && cargo clippy --all-targets -- -D warnings`   | zero warnings       |
| Format     | `cd src-tauri && cargo fmt --all -- --check`                  | exit 0              |

## Scope

**In scope**:
- `src-tauri/src/workspace/branching.rs` — ADD a `#[cfg(test)] mod tests`
  block only; production code unchanged.
- `src-tauri/src/testkit.rs` — only if a small, generic fixture helper is
  genuinely missing (e.g. "add a remote with branch X"); keep additions
  generic.

**Out of scope** (do NOT touch):
- Any production logic in `branching.rs` — if a test exposes a bug, report it
  (STOP conditions).
- `git/ops.rs`, `workspace/workspaces.rs`, the snapshot tests under
  `src-tauri/tests/`.

## Git workflow

- Branch: `advisor/004-workspace-branching-tests`
- Conventional commit, e.g. `test(workspace): characterize branching operations`
- No changeset (not user-visible).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read the module and the harness

Read `branching.rs` fully, then `testkit.rs` fully (note what `GitTestRepo`
and `WorkspaceFixture` already provide — especially how `insert_workspace`
links a workspace row to an on-disk repo path and what `WorkspaceMode` /
state values it sets).

**Verify**: you can state, for each public function, which fixture it needs
(git-only vs git+DB). Include that mapping in your report.

### Step 2: Test the pure function first

`list_branch_picker_entries(repo_root, remote)` cases:
- repo with local branches only → entries have `has_local: true, has_remote: false`;
- repo with a remote (use the `init_repo_with_remote` pattern) where a branch
  exists both locally and on the remote → one merged entry with both flags;
- remote-only branch → `has_local: false, has_remote: true`;
- results sorted by name; empty repo → empty vec (must not error).

**Verify**: `cd src-tauri && cargo test --lib workspace::branching` → these pass.

### Step 3: DB-backed happy paths

Using `TestEnv` + `insert_repo` + `insert_workspace` pointed at a temp git
repo:
- `rename_workspace_branch`: rename succeeds; the git branch is renamed
  (assert via `git_ops::current_branch_name`) AND the DB row's branch column
  is updated (assert via a direct `env.db_connection()` query). Then the
  failure path: a branch name that already exists → returns `Err`, original
  branch untouched.
- `list_remote_branches`: with a workspace fixture → returns the remote's
  branches; with neither id resolvable → `Err`.
- `update_intended_target_branch_local`: target updated in DB; verify the
  realignment behavior you observe (characterize, don't assume).

**Verify**: same test command → all pass.

### Step 4: The riskiest path — `continue_workspace_from_target_branch`

Characterize at least: happy path (workspace continues onto a new branch from
target; assert resulting branch and clean status) and one failure that should
trigger `rollback_continue_branch` (e.g. make the continuation fail by
pre-creating a conflicting branch). Assert the rollback restored the prior
branch. If inducing the failure deterministically proves impractical after
two attempts, cover happy-path only and say so in the report.

Call `_reset_prefetch_rate_limit()` in tests that touch prefetch/realign
paths so the shared rate-limit map can't leak state between tests (the env
lock in `TestEnv` serializes tests, but the map is process-global).

**Verify**: `cd src-tauri && cargo test` → full suite passes (including the
pipeline snapshot tests — they must be untouched).

### Step 5: Lint + format

**Verify**: clippy zero warnings; `cargo fmt --all -- --check` exits 0.

## Test plan

See Steps 2–4. Pattern: `workspace/workspaces.rs:1671` test module for
fixtures; `git/ops.rs:1513` for git fixture construction. Expect roughly
10–15 new tests.

## Done criteria

- [ ] `grep -c "#\[test\]" src-tauri/src/workspace/branching.rs` ≥ 10
- [ ] `cd src-tauri && cargo test` exits 0
- [ ] `cargo clippy --all-targets -- -D warnings` exits 0
- [ ] `git diff --stat` shows changes only in `branching.rs` (test module) and
      optionally `testkit.rs`
- [ ] No production-logic lines of `branching.rs` changed (diff shows only the
      appended `#[cfg(test)]` module)

## STOP conditions

Stop and report back (do not improvise) if:

- A test exposes a real bug (wrong DB state after failure, missing rollback,
  data loss). Report the exact function, input, and observed vs expected —
  the fix is a separate, reviewed change.
- The public function list differs from "Current state" (module drifted).
- `TestEnv` fixtures cannot represent a needed workspace mode/state without
  non-generic testkit changes.
- The full suite was already red before your changes.

## Maintenance notes

- These are characterization tests: they pin today's behavior, including any
  quirks. A future intentional behavior change should update the test in the
  same PR with a comment saying so.
- This unblocks any future refactor of branching.rs (e.g. splitting it per
  the repo's <300-line rule — deferred deliberately; don't do it here).
