# Plan 007: Extract shared infrastructure from the four sidecar session managers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2818226c..HEAD -- sidecar/src/claude-session-manager.ts sidecar/src/codex-app-server-manager.ts sidecar/src/opencode-session-manager.ts sidecar/src/cursor-session-manager.ts`
> These files churn with feature work. Re-run the Step 1 inventory against
> live code; STOP only if a consolidation has already begun (a shared base
> module exists).

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED — provider behavior must not change; the SDKs differ subtly
  (abort semantics, user-input round-trips). Extract infrastructure, not
  provider logic.
- **Depends on**: plans/003-sidecar-request-parser-tests.md (characterization
  net for the wire contract)
- **Category**: tech-debt
- **Planned at**: commit `2818226c`, 2026-06-11

## Why this matters

Four provider session managers implement the `SessionManager` interface
(`sidecar/src/session-manager.ts:138-230`): `claude-session-manager.ts`
(1,363 lines), `codex-app-server-manager.ts` (2,139), `opencode-session-manager.ts`
(1,172), `cursor-session-manager.ts`. Each independently re-implements
infrastructure that is provider-agnostic: platform binary-path resolution,
the pending user-input-request map (`resolveUserInput`), title-generation
wrapping, context-usage timeout/drain loops, shutdown iteration over live
sessions, and error classification. Every bug fix in one must be hand-ported
to the others, and they drift (the interface doc in `session-manager.ts:1-6`
still says "Both `ClaudeSessionManager` and `CodexSessionManager`" — there
are four now). Each new provider (OpenCode and Cursor were added recently;
terminal agents are coming) copies the newest manager and inherits its bugs.

## Current state

- `sidecar/src/session-manager.ts` (230 lines) — interface + shared types
  ONLY (`Provider`, `SendMessageParams`, `UserInputResolution`,
  `SlashCommandInfo`, `ProviderModelInfo`, `SessionManager`). No logic.
- The four implementations listed above; `sidecar/src/index.ts` dispatches by
  provider and fans `resolveUserInput` out to every manager
  (`session-manager.ts:145-149` documents this contract).
- Existing tests touching managers: `opencode-session-manager.test.ts`,
  `claude-steer-race.test.ts`, `codex-steer-gate.test.ts`,
  `claude-project-mcp.test.ts`, `codex-config.test.ts`, `context-usage.test.ts`,
  `agent-proxy.test.ts` — these are your regression net; they must pass
  unmodified.
- Conventions: Bun + TypeScript, `bun:test`, Biome tab indent, `.js` import
  suffixes (see `session-manager.ts:8-9`).

## Commands you will need

| Purpose       | Command                          | Expected on success |
|---------------|----------------------------------|---------------------|
| Install       | `bun install`                    | exit 0              |
| Sidecar tests | `cd sidecar && bun test`         | all pass            |
| Typecheck     | `bun run typecheck`              | exit 0 (covers sidecar) |
| Sidecar build | `cd sidecar && bun run build`    | exit 0 (compile-target check) |
| Lint          | `bun run lint`                   | exit 0              |

## Scope

**In scope**:
- `sidecar/src/session-manager-shared.ts` (create — extracted utilities)
- The four `*-session-manager.ts` / `codex-app-server-manager.ts` files
  (replace duplicated code with imports)
- New test files for the extracted utilities
- The stale doc comment at `session-manager.ts:1-6`

**Out of scope** (do NOT touch):
- `sidecar/src/index.ts` dispatch logic
- `sidecar/src/request-parser.ts`, `emitter.ts`
- Provider-specific behavior: Claude's AskUserQuestion/MCP elicitation
  conversion, Codex JSON-RPC wrapping, sandbox policies, MCP forwarding —
  these stay in their managers even where they look similar
- The Rust side and the wire contract (no event shape changes — the pipeline
  snapshot tests in `src-tauri/tests/` depend on it)

## Git workflow

- Branch: `advisor/007-sidecar-shared-infrastructure`
- One commit per extracted utility (reviewable), conventional style, e.g.
  `refactor(sidecar): extract shared pending-user-input registry`
- No changeset (not user-visible).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build the duplication inventory (do not skip)

Read all four managers. For each of these candidate concerns, record where
each manager implements it (file:line) and whether the implementations are
behaviorally identical, similar-with-flags, or genuinely divergent:

1. Binary/vendor path resolution (claude ~lines 68-81 has a platform-dirs
   block; codex ~60-79 similar)
2. Pending user-input map + `resolveUserInput` claim-or-false contract
3. Title generation (timeout + exactly-one-`titleGenerated` guarantee)
4. Context-usage query timeout/drain loop (claude ~1300-1340; codex similar)
5. `shutdown()` iteration over live sessions
6. Error classification / `errorMessage` usage

Output: a table in your report. Only concerns marked "identical" or
"similar-with-flags" proceed to extraction. **Genuinely divergent concerns
are out of scope — list them and move on.**

**Verify**: the table exists and cites file:line for all four managers per
concern.

### Step 2: Extract one concern at a time, tests first

For each extractable concern, in this order (lowest risk first):
binary-path resolution → pending user-input registry → title wrapper →
context-usage drain → shutdown helper.

Per concern:
1. Write a unit test for the NEW shared utility in
   `sidecar/src/session-manager-shared.test.ts` (pattern:
   `sidecar/src/emitter.test.ts` — plain `bun:test`, no SDK mocks needed for
   infrastructure code).
2. Implement in `session-manager-shared.ts` (or a focused file per concern if
   it exceeds ~150 lines — repo rule: no monoliths).
3. Switch ONE manager to it; run the full sidecar suite.
4. Switch the remaining managers one by one, suite after each.

**Verify** (after every switch): `cd sidecar && bun test` → all pass,
including the steer-race and steer-gate tests (they exercise real async
manager behavior and will catch lifecycle regressions).

### Step 3: Fix the stale interface doc

Update `session-manager.ts:1-6` to name all four implementations.

**Verify**: `head -8 sidecar/src/session-manager.ts` reflects reality.

### Step 4: Size and build check

**Verify**: `cd sidecar && bun run build` → exit 0 (the compiled sidecar
binary still builds); `bun run typecheck` → 0; `bun run lint` → 0;
`wc -l sidecar/src/*-manager.ts` shows each manager shrank (expect a few
hundred lines total reduction — report the numbers).

## Test plan

- New: `session-manager-shared.test.ts` — per extracted utility: happy path,
  the timeout path (use Bun's fake timers or short real timeouts < 50ms), the
  "no session found" path, double-resolution of a user-input id (second call
  returns false).
- Pattern: `emitter.test.ts` for structure; `claude-steer-race.test.ts` shows
  how this repo tests async manager behavior.
- Existing suite passes UNMODIFIED — if an existing test needs editing, that's
  a behavior change, which is a STOP.

## Done criteria

- [ ] `sidecar/src/session-manager-shared.ts` (or focused sub-files) exists
      with co-located passing tests
- [ ] All four managers import the shared utilities; the Step 1 inventory's
      "identical" rows have exactly one implementation left
- [ ] `cd sidecar && bun test` exits 0 with zero modifications to
      pre-existing test files
- [ ] `cd sidecar && bun run build`, `bun run typecheck`, `bun run lint` exit 0
- [ ] `session-manager.ts:1-6` doc names all four implementations
- [ ] Report contains the Step 1 inventory table and per-file line-count delta

## STOP conditions

Stop and report back (do not improvise) if:

- An existing test fails after a switch and the fix would change manager
  behavior (not just an import).
- Two managers' versions of a concern turn out to differ in a way that looks
  like a BUG in one of them (e.g. one drains on abort, one doesn't) — report
  it; do not silently pick a winner, the divergence may be intentional
  SDK-specific behavior.
- The extraction requires changing `index.ts` dispatch or any emitted event
  shape.
- Plan 003's tests don't exist yet (dependency not landed).

## Maintenance notes

- New providers should start from the shared utilities + the `SessionManager`
  interface, not by copying an existing manager — consider a short
  `sidecar/README` note (deferred).
- Reviewer: for each extracted concern, diff the shared implementation
  against EACH manager's removed version — flags papering over real
  behavioral differences are the failure mode of this refactor.
- Deferred deliberately: consolidating `sendMessage` event loops (the genuinely
  provider-specific core) and any wire-contract changes.
