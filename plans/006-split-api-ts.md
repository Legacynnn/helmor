# Plan 006: Split the 5,002-line `src/lib/api.ts` into domain modules

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2818226c..HEAD -- src/lib/api.ts`
> This file churns constantly (top-2 churn in the repo). If it changed,
> re-run the inventory in Step 1 against live code — the split is mechanical,
> so drift usually just means a slightly different function list, not a STOP.
> STOP only if the file was already split or restructured.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: LOW-MED — purely mechanical moves behind a re-export barrel; the
  type system catches mistakes. The risk is merge pain with in-flight branches.
- **Depends on**: none (but coordinate timing — see STOP conditions)
- **Category**: tech-debt
- **Planned at**: commit `2818226c`, 2026-06-11

## Why this matters

`src/lib/api.ts` is 5,002 lines: 249 exported functions (every Tauri `invoke`
wrapper) plus 100+ mirrored types, in one file. It is the second-highest-churn
file in the repo (193 commits in 3 months), so it's a permanent merge-conflict
magnet, and it violates the repo's own hard rule (CLAUDE.md: "When a module
grows beyond ~300 lines, convert ... split") by 16×. The repo just paid for
this lesson with App.tsx (1,976 → 18 lines). A barrel re-export keeps all ~100
importing files untouched, making this a low-risk, high-relief change.

## Current state

- `src/lib/api.ts` — single file; starts with the transport shim import:

```ts
// src/lib/api.ts:1-8
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { InspectorFileItem } from "./editor-session";
import { type ErrorCode, extractError } from "./errors";
// `invoke` / `Channel` / `listen` route through the transport shim so the same
// frontend works in the desktop Tauri webview AND when served to a phone
// browser by the companion server. See `src/lib/ipc.ts`.
import { Channel, closeChannel, invoke, listen, type UnlistenFn } from "./ipc";
import { setSessionThreadPaginationState } from "./session-thread-pagination";
```

- Contents cluster by backend command domain (mirroring
  `src-tauri/src/commands/`: session, repository, workspace, editor, github/
  forge, conductor, settings, system) plus UI-sync subscription helpers
  (`subscribeUiMutations`, `UiMutationEvent` — consumed by
  `src/shell/hooks/use-ui-sync-bridge.ts`).
- Importers: ~100 files import from `@/lib/api` (named imports only — verify
  with `grep -rn 'from "@/lib/api"' src | wc -l`).
- CLAUDE.md rule that constrains the result: the `UiMutationEvent` mirror in
  "api.ts" is referenced by name in CLAUDE.md ("mirror the variant in
  `UiMutationEvent` in `src/lib/api.ts`") — keep that type re-exported from
  the barrel so the documented path stays true, and update CLAUDE.md's wording
  if you move its definition (allowed, see Scope).
- Conventions: Biome (tab indent), `@/` alias, feature folders for features —
  but this is shared IPC glue, so `src/lib/api/` is the right home.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun run typecheck`      | exit 0              |
| Frontend tests | `bun run test:frontend` | all pass       |
| Lint      | `bun run lint`           | exit 0              |
| Build     | `bun run build`          | exit 0              |

## Scope

**In scope**:
- `src/lib/api.ts` → becomes `src/lib/api/index.ts` (barrel) +
  `src/lib/api/<domain>.ts` modules
- `CLAUDE.md` — only the one sentence naming `src/lib/api.ts` for
  `UiMutationEvent`, if the definition moves
- Test files co-located with api.ts if any exist (`ls src/lib/api*.test.*`)

**Out of scope** (do NOT touch):
- The ~100 importing files. The barrel must make every existing
  `import { X } from "@/lib/api"` resolve unchanged. If even one importer
  needs editing, your barrel is wrong.
- `src/lib/ipc.ts` (the transport shim), `src/lib/query-client.ts`.
- Any function body, signature, type shape, or behavior. Moves only.
- The Rust side.

## Git workflow

- Branch: `advisor/006-split-api-ts`
- Commit per domain module move (reviewable chunks), conventional style, e.g.
  `refactor(lib): extract workspace commands from api.ts`
- No changeset (not user-visible).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Inventory and partition

Generate the export inventory:
`grep -n "^export " src/lib/api.ts > /tmp/api-exports.txt` and skim the file's
section comments (there's a `// ---` divider at line 1290). Partition every
export into domains mirroring `src-tauri/src/commands/`:

`workspace.ts`, `session.ts`, `editor.ts`, `forge.ts` (github/gitlab accounts,
PR/MR, inbox/labels), `repository.ts`, `settings.ts`, `system.ts` (window/blur/
macOS chrome), `conductor.ts`, `ui-sync.ts` (UiMutationEvent +
subscribeUiMutations), `types.ts` (cross-domain shared types like
`WorkspaceState`, `GroupTone` — only types needed by 2+ domain modules).

Rules: each function goes where its Tauri command lives on the Rust side;
each type goes next to the functions that use it unless shared. Target every
module < 600 lines (the file can't honestly reach <300 per module without
over-fragmenting; say so in the report).

**Verify**: every line of /tmp/api-exports.txt is assigned to exactly one
module. Paste the partition (module → export count) in your report.

### Step 2: Mechanical extraction, one domain at a time

For each domain (start with the smallest):
1. Create `src/lib/api/<domain>.ts`; move the functions + their private
   helpers + their types verbatim. Internal cross-domain references import
   from the sibling module directly (not the barrel — avoids cycles).
2. In the shrinking `api.ts`, re-export: `export * from "./api/<domain>";`
   (temporary, until Step 3).
3. Run `bun run typecheck` after EACH domain move.

**Verify** (after each domain): `bun run typecheck` → 0.

### Step 3: Convert to a real barrel

When `api.ts` contains only re-exports, move it to `src/lib/api/index.ts`
containing only `export * from "./<domain>";` lines (plus explicit
`export type { ... }` if `isolatedModules` complains). Delete `src/lib/api.ts`.
The `@/lib/api` specifier now resolves to the directory's index.

**Verify**: `bun run typecheck` → 0; `bun run test:frontend` → all pass;
`grep -rn 'from "@/lib/api"' src | wc -l` unchanged from Step 1's count;
`git diff --stat` shows zero changes in files outside `src/lib/api*` and
CLAUDE.md.

### Step 4: Guard against cycles and re-export collisions

`bun run build` (Vite/Rolldown will error on genuinely circular runtime
imports; `export *` collisions surface in typecheck). If two domains export
the same name, that's a pre-existing duplicate — STOP and report rather than
renaming.

**Verify**: `bun run build` → exit 0; `bun run lint` → 0.

### Step 5: Update CLAUDE.md pointer (if needed)

If `UiMutationEvent` now lives in `src/lib/api/ui-sync.ts`, update the one
CLAUDE.md sentence to say so.

**Verify**: `grep -n "UiMutationEvent" CLAUDE.md` shows the corrected path.

## Test plan

No new tests — this is a behavior-preserving move; the existing frontend suite
plus typecheck is the net. If `src/lib/` has api-adjacent tests, they must
pass unmodified (their imports go through the same barrel).

## Done criteria

- [ ] `src/lib/api.ts` no longer exists; `src/lib/api/index.ts` is re-exports only
- [ ] `wc -l src/lib/api/*.ts` — no module over 600 lines, index < 60
- [ ] `bun run typecheck`, `bun run test:frontend`, `bun run lint`,
      `bun run build` all exit 0
- [ ] `git diff --stat 2818226c..HEAD -- src` touches only `src/lib/api*`
- [ ] Zero importer files modified

## STOP conditions

Stop and report back (do not improvise) if:

- Two domain modules need to export the same name (pre-existing duplicate
  export — needs a human decision).
- A genuine circular import emerges that re-export ordering can't resolve.
- There are uncommitted or in-flight branches the operator told you about
  that heavily touch api.ts — this refactor should land in a quiet window;
  if you can't know, note the risk in the report.
- Function bodies would need edits (not just moves) to compile.

## Maintenance notes

- New IPC wrappers go in the matching domain module; the barrel line is
  already there. Adding to `index.ts` directly should fail review.
- Reviewer: spot-check 3 moved functions against `git log -p` to confirm
  verbatim moves; check the barrel has no logic.
- Follow-up deliberately deferred: per-domain test files, and tightening each
  module under 300 lines by splitting types out further.
