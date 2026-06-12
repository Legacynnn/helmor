# Plan 003: Unit-test the sidecar's request parser (the stdin trust boundary)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2818226c..HEAD -- sidecar/src/request-parser.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW — tests only; no production code changes expected.
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `2818226c`, 2026-06-11

## Why this matters

The sidecar is a long-lived Bun process; every request from the Rust backend
arrives as a JSON line on stdin and is narrowed by
`sidecar/src/request-parser.ts` (241 lines, 12 exported functions). It is the
trust boundary for the entire agent-streaming path — a parsing regression can
crash the sidecar and halt all agent streams at once. It currently has **zero
tests** (10 test files exist in `sidecar/src/`, none for this module). These
are pure functions with throw-on-invalid semantics: the cheapest, highest-value
tests in the repo. They also become the characterization safety net for plan
007 (session-manager consolidation).

## Current state

- `sidecar/src/request-parser.ts` — exported functions (line numbers at `2818226c`):
  - `parseRequest` (21) — `JSON.parse` + shape check; throws `"request must be an object"`, `"request.id must be a string"`, `"request.method must be a string"`, `"request.params must be an object"`.
  - `requireString` (36), `optionalString` (47), `optionalObject` (72)
  - `parseProvider` (86) — narrows to `Provider` (`"claude" | "codex" | "cursor" | "opencode"`, defined in `sidecar/src/session-manager.ts:11`)
  - `parseSendMessageParams` (97), `parseAgentProxySettings` (127),
    `parseOptionalStringRecord` (150), `parseListSlashCommandsParams` (189),
    `parseGetContextUsageParams` (201), `parseSteerSessionParams` (220),
    `errorMessage` (239)

Opening excerpt (verify you're looking at the same code):

```ts
// sidecar/src/request-parser.ts:21-34
export function parseRequest(line: string): RawRequest {
	const parsed = JSON.parse(line) as unknown;
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("request must be an object");
	}
	const { id, method, params } = parsed as Record<string, unknown>;
	if (typeof id !== "string") throw new Error("request.id must be a string");
	...
}
```

- Test conventions: `bun:test`, co-located `*.test.ts`. Exemplar —
  `sidecar/src/emitter.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createSidecarEmitter } from "./emitter";

describe("createSidecarEmitter", () => {
	it("emits planCaptured with plan content", () => { ... });
});
```

- Biome formatting (tab indent) applies to sidecar code too.

## Commands you will need

| Purpose       | Command                                            | Expected on success |
|---------------|----------------------------------------------------|---------------------|
| Install       | `bun install` (root; postinstall installs sidecar) | exit 0              |
| Sidecar tests | `cd sidecar && bun test`                           | all pass            |
| Single file   | `cd sidecar && bun test src/request-parser.test.ts`| all pass            |
| Typecheck     | `bun run typecheck`                                | exit 0              |
| Lint          | `bun run lint`                                     | exit 0              |

## Scope

**In scope**:
- `sidecar/src/request-parser.test.ts` (create — the only new file)

**Out of scope** (do NOT touch):
- `sidecar/src/request-parser.ts` itself. If a test reveals a real bug, do
  not fix it — record it in your report (see STOP conditions for the one
  exception class).
- `sidecar/src/index.ts`, the session managers, `emitter.ts`.

## Git workflow

- Branch: `advisor/003-sidecar-request-parser-tests`
- Conventional commit, e.g. `test(sidecar): cover request-parser trust boundary`
- No changeset (not user-visible).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read the module fully

Read `sidecar/src/request-parser.ts` top to bottom, plus the param types it
imports from `sidecar/src/session-manager.ts` (`SendMessageParams`,
`ListSlashCommandsParams`, `GetContextUsageParams`, `Provider`) and
`AgentProxySettings` from `sidecar/src/agent-proxy.ts`. List every distinct
throw site — each becomes at least one test.

**Verify**: your list of throw sites matches a
`grep -c "throw new Error" sidecar/src/request-parser.ts` count.

### Step 2: Write the tests

Create `sidecar/src/request-parser.test.ts`, one `describe` block per exported
function, modeled on `emitter.test.ts`. Required coverage:

- `parseRequest`: valid line; non-JSON line (expect the `JSON.parse` throw);
  JSON scalar (`"5"`); null; missing/wrong-typed `id`, `method`, `params`
  (assert the exact error messages quoted in "Current state").
- `parseProvider`: each of the four valid providers round-trips; an unknown
  string and a non-string each throw.
- `requireString` / `optionalString` / `optionalObject` /
  `parseOptionalStringRecord`: present-and-valid, absent, wrong-typed; for
  the record parser, a record containing a non-string value.
- `parseSendMessageParams`: a fully-populated valid payload (build one from
  the `SendMessageParams` interface in `session-manager.ts:13-52` — note
  `images` is always present, an empty array means none); a minimal valid
  payload (only required fields); each required field missing → throws.
- `parseAgentProxySettings`, `parseListSlashCommandsParams`,
  `parseGetContextUsageParams`, `parseSteerSessionParams`: one valid, one
  invalid-shape case each, plus any optional-field defaulting the code does.
- `errorMessage`: an `Error`, a string, a non-error object — returns a string
  for all three, never throws.

Assert error cases with `expect(() => ...).toThrow("<exact message>")` so the
wire contract is pinned, not just "it throws".

**Verify**: `cd sidecar && bun test src/request-parser.test.ts` → all pass;
expect ≥ 30 assertions.

### Step 3: Full suite + lint

**Verify**: `cd sidecar && bun test` → all pass (no existing test broken);
`bun run typecheck` → exit 0; `bun run lint` → exit 0.

## Test plan

This plan IS the test plan — see Step 2 for the case list. Structural pattern:
`sidecar/src/emitter.test.ts`.

## Done criteria

- [ ] `sidecar/src/request-parser.test.ts` exists with a `describe` per
      exported function (12 functions)
- [ ] `cd sidecar && bun test` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `git status` shows only the new test file (plus `plans/README.md`)
- [ ] No changes to `sidecar/src/request-parser.ts`

## STOP conditions

Stop and report back (do not improvise) if:

- Writing a test reveals the parser ACCEPTS a malformed shape that the Rust
  side could plausibly send (e.g. a missing required field silently becoming
  `undefined` and flowing onward). Do not "fix" the parser — report the exact
  function and input; the fix needs a coordinated change with the Rust caller.
- The exported function list differs from the 12 named above (module drifted).
- Any pre-existing sidecar test fails before your changes (broken baseline).

## Maintenance notes

- These tests pin the sidecar wire contract. When a new request method is
  added (new `parse*Params`), the PR must add a `describe` block here —
  reviewers should treat a parser change without a test change as a smell.
- This is the prerequisite characterization layer for plan 007 (session
  manager consolidation).
