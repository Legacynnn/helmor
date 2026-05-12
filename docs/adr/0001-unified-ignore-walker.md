# 0001 — Unify workspace file walking on `ignore::WalkBuilder`

Status: Accepted — 2026-05-12

## Context

Helmor needs two surfaces over the workspace tree:

- **Cmd+P quick-open** (`searchWorkspacePaths`) — fuzzy file-name match.
- **Cmd+Shift+F content search** (`searchWorkspaceContent`) — workspace-wide grep.

The pre-existing `search_paths` walker was hand-rolled: a recursive `fs::read_dir` with a hard-coded denylist (`.git`, `node_modules`, `dist`, …) and a special-case for `.env`. It did **not** consult `.gitignore`. Two walkers with different rules would have meant the two surfaces disagreeing on which files exist — open a path via Cmd+P, find it absent from `#content` results (or vice versa).

## Decision

Both surfaces share a single walker config in `src-tauri/src/workspace/files/walker.rs`:

- `ignore::WalkBuilder` with `.git_ignore(true)`, `.git_exclude(true)`, `.git_global(true)`, `.parents(true)`.
- `.hidden(false)` — surface dotfiles (`.github/`, `.env.example`, `.eslintrc`) developers actually want.
- `filter_entry` denylist layered on top, mirroring the old hard-coded list, so `.git/`, `node_modules`, `dist`, build outputs are skipped even in repos with permissive (or missing) `.gitignore`.
- Symlinks not followed (`.follow_links(false)`).

The denylist is canonical only when `.gitignore` doesn't already cover it — for almost every modern repo, the gitignore is the source of truth and the denylist is a safety net.

## Consequences

**Positive:**

- Both search surfaces agree on the file universe. No surprise where the same path exists in one and not the other.
- Generated output (built JS bundles, `target/`, `dist/`) stops appearing in Cmd+P for repos that gitignore them — usually a win (less noise).
- New content search inherits the gitignore-respecting behavior for free.
- One module to audit if we add a third surface later (symbol search, etc.).

**Negative / risks:**

- Behavior change for existing users of Cmd+P: any path covered by `.gitignore` (e.g. local `.env`, generated tokens) is no longer findable through quick-open. The denylist still catches the universally-noisy directories, but a user who explicitly gitignores a tracked directory will see it disappear from Cmd+P. This is the right default but worth calling out in release notes.
- The `ignore` crate adds a transitive dep; small (~1 MB compiled).

## Rejected alternatives

- **Diverge intentionally** — content search uses `ignore`, path search keeps its hand-rolled walker. Rejected: a permanent inconsistency that creates bug-class confusion ("why does this file show in one and not the other?") with no upside.
- **Replace the denylist entirely with gitignore** — rejected: repos without a `.gitignore` (or with a permissive one) would surface `node_modules` and `target/`, which is never what users want.
