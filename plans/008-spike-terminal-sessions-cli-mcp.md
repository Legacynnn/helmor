# Plan 008: Spike — expose terminal sessions through the CLI and MCP server

> **Executor instructions**: This is a DESIGN SPIKE, not a build plan. The
> deliverable is a written design (`docs/` proposal) plus a thin
> proof-of-concept if cheap — not a finished feature. Follow the steps; if a
> STOP condition occurs, stop and report. When done, update the status row in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2818226c..HEAD -- docs/cli-and-mcp.md src-tauri/src/commands/session.rs`
> If terminal-session support already appears in `docs/cli-and-mcp.md`,
> the feature shipped — mark this plan REJECTED in the index and stop.

## Status

- **Priority**: P3
- **Effort**: M (spike: 0.5–1 day)
- **Risk**: LOW (design output; PoC is additive)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `2818226c`, 2026-06-11

## Why this matters

Terminal agents recently became first-class in the UI: commits `c70e7480`
("feat(terminal): make terminal agents first-class"), `6ee45463` ("unified
session launcher with terminal sessions"), `3631faff` (tabbed New-session
popover). But the automation surface didn't follow: `docs/cli-and-mcp.md`
documents `helmor session new --workspace <ref>` and the MCP tools
`helmor_session_list` / `helmor_session_create` with no way to specify a
terminal session. Helmor's pitch is "coding agent orchestration"; an
orchestrator (a script, a Claude Code session driving Helmor via MCP) can
create conversation sessions but not terminal ones. This spike defines the
smallest coherent API to close that asymmetry.

## Current state (verified at `2818226c`)

- `docs/cli-and-mcp.md` (205 lines): CLI examples at lines 35-41
  (`helmor session new --workspace helmor/earth`), MCP tool table at lines
  68-72 (`helmor_session_create` — "Create session"). The word "terminal"
  appears only in the phrase "terminal entrypoint" (line 4). No agent-type
  flag anywhere.
- `src-tauri/src/bin/helmor-cli.rs` is a 17-line shim — the real CLI lives
  elsewhere in the crate (find it: `grep -rn "session" src-tauri/src/cli* -r`
  or follow the shim's imports).
- Terminal sessions exist in the data model already (the UI creates them) —
  locate how: `grep -rn "terminal" src-tauri/src/commands/session.rs
  src-tauri/src/models/sessions.rs sidecar/src/index.ts | head -30`.
- MCP server mode: `src-tauri/src/mcp.rs`.

## Commands you will need

| Purpose   | Command                                            | Expected on success |
|-----------|----------------------------------------------------|---------------------|
| CLI build | `bun run dev:cli:build`                            | exit 0              |
| CLI run   | `./src-tauri/target/debug/helmor-cli --help`       | usage prints        |
| Rust tests| `cd src-tauri && cargo test`                       | all pass            |
| Lint      | `cd src-tauri && cargo clippy --all-targets -- -D warnings` | exit 0     |

## Scope

**In scope**:
- `docs/proposals/terminal-sessions-cli-mcp.md` (create — the main deliverable)
- A PoC commit on the spike branch touching `src-tauri/src/` CLI/MCP code
  (optional, only if the design lands cleanly in < 2 hours of work)

**Out of scope**:
- Shipping the feature (frontend changes, full tests, changeset) — that's the
  follow-up plan this spike produces.
- Any sidecar or pipeline changes.

## Git workflow

- Branch: `advisor/008-spike-terminal-cli`
- Conventional commits (`docs(proposal): ...`, `feat(cli): poc ...`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Map how the UI creates a terminal session

Trace the UI path end to end: which Tauri command the session launcher calls
for a terminal session, what's stored in `sessions` (agent/kind column?), and
what the sidecar receives (if anything — terminals may bypass the sidecar).
Record exact file:line for each hop.

**Verify**: you can write the one-paragraph "how it works today" section with
citations.

### Step 2: Map the CLI/MCP session-create path

Find where `helmor session new` and the MCP `helmor_session_create` tool are
implemented and what params they accept today.

**Verify**: same — citations in hand.

### Step 3: Write the proposal

`docs/proposals/terminal-sessions-cli-mcp.md` containing: today's behavior
(Steps 1-2), the proposed CLI flag (e.g. `helmor session new --kind terminal`
— pick naming consistent with what the data model actually calls it), the MCP
tool change (new param on `helmor_session_create` vs. a new tool — recommend
one, justify in 2-3 sentences), how a created terminal session is addressed
afterwards (can `helmor send` target it? if not, say what its lifecycle verbs
are), open questions, and a build-effort estimate.

**Verify**: the proposal answers: flag name, param shape, addressing story,
what `docs/cli-and-mcp.md` sections change.

### Step 4 (optional): PoC

If Steps 1-2 revealed the change is just threading a kind/agent-type param
through existing plumbing, implement the CLI flag only (not MCP), verify
manually against a dev app instance, and note results in the proposal.

**Verify**: `bun run dev:cli:build` exit 0; `cargo clippy` clean; a terminal
session row appears (check via `helmor session list --workspace <ref>`).

## Test plan

Spike deliverable is the proposal; PoC needs no tests (the follow-up build
plan will specify them).

## Done criteria

- [ ] `docs/proposals/terminal-sessions-cli-mcp.md` exists and covers: current
      behavior with citations, proposed CLI + MCP surface, addressing story,
      open questions, effort estimate
- [ ] `cd src-tauri && cargo test` exits 0 (PoC didn't break anything; trivially
      true if no PoC)
- [ ] Status row updated in `plans/README.md`

## STOP conditions

- Terminal sessions turn out to be UI-process-only constructs with no backend
  session row (nothing for a CLI to create) — report; the proposal becomes
  "what backend support would be needed" instead.
- The CLI implementation can't be located from the shim within 30 minutes —
  report what you found.

## Maintenance notes

- The proposal should land where the team can react to it; the follow-up
  build plan should be written only after a maintainer accepts the design.
