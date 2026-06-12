# Plan 002: Enable a Content-Security-Policy and scope the Tauri asset protocol

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2818226c..HEAD -- src-tauri/tauri.conf.json`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — an over-strict CSP can break Monaco, shiki, fonts, xterm,
  or streamed-markdown rendering at runtime; this plan is iterative by design.
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `2818226c`, 2026-06-11

## Why this matters

Helmor's entire job is rendering untrusted output — AI-agent markdown, repo
contents, GitHub API data — inside a Tauri webview. Today
`src-tauri/tauri.conf.json` sets `"csp": null` (no Content-Security-Policy at
all) and grants the asset protocol `"allow": ["**"]` (any file on disk can be
served via `asset://`). The app does sanitize markdown (`rehype-sanitize` via
streamdown), but CSP is the backstop for the day a sanitizer bypass or a
`dangerouslySetInnerHTML` slip ships. With CSP null, any such slip is full
script execution in a webview that holds IPC access to git, the filesystem,
and GitHub credentials. The wildcard asset scope additionally lets any
`asset://`-resolving URL read arbitrary files (e.g. the SQLite DB, JSONL logs).

## Current state

`src-tauri/tauri.conf.json` (verified at `2818226c`, inside `app.security`):

```json
"security": {
    "csp": null,
    "assetProtocol": {
        "enable": true,
        "scope": {
            "allow": ["**"]
        }
    }
}
```

There is no `<meta http-equiv="Content-Security-Policy">` in `index.html`
(verified by grep). Relevant frontend stack that a CSP must accommodate:

- **Monaco editor** (`monaco-editor@0.55`, loaded via `src/lib/monaco-runtime.ts`) — uses web workers and injected styles.
- **shiki / streamdown** — syntax highlighting; shiki may use WASM (`wasm-unsafe-eval`).
- **Tailwind v4 + inline styles** — needs `style-src 'unsafe-inline'` (Tauri's docs note Tauri injects its own nonces/hashes for its bundled assets, but app-generated inline styles from Monaco/motion still need it).
- **Fonts**: `@fontsource-variable/geist` — bundled, `font-src 'self' data:`.
- **Images**: agent/GitHub avatars and attachments. Check `src/lib/api.ts` for
  custom protocols (e.g. avatar cache, attachment serving) and include the
  actual schemes you find. Remote `https:` images appear in chat markdown
  (GitHub avatars) — `img-src` needs `https:` unless the app proxies them.
- **IPC**: Tauri v2 uses `ipc:` / `http://ipc.localhost` internally;
  `connect-src` must include them (Tauri injects automatically for its own
  needs when CSP is set via tauri.conf.json — verify against Tauri v2 docs).
- The frontend can also be served to a phone browser by a companion server
  (see comment in `src/lib/api.ts:4-7` about the transport shim) — CSP here
  only affects the Tauri webview, set via tauri.conf.json, so the companion
  path is unaffected.

Where asset protocol is actually used: search before scoping. Run
`grep -rn "convertFileSrc\|asset://" src/ src-tauri/` and scope to exactly the
directories those call sites serve (likely image attachments and avatar cache
under the app data dir).

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Install   | `bun install`                        | exit 0              |
| Dev build (manual testing) | `bun run dev`       | app launches        |
| Typecheck | `bun run typecheck`                  | exit 0              |
| Frontend tests | `bun run test:frontend`         | all pass            |
| Rust lint | `cd src-tauri && cargo clippy --all-targets -- -D warnings` | exit 0 |

## Suggested executor toolkit

- Tauri v2 security docs: https://v2.tauri.app/security/csp/ — read before
  writing the policy; Tauri v2 appends hashes/nonces for its injected scripts
  when `csp` is set in tauri.conf.json.
- The repo's Tauri MCP bridge (debug builds only — see CLAUDE.md "Debugging")
  is the sanctioned way to drive the app and read webview console errors:
  `read_logs source=console` will show CSP violations.

## Scope

**In scope**:
- `src-tauri/tauri.conf.json` (the `app.security` block only)

**Out of scope** (do NOT touch):
- `index.html` — set CSP via Tauri config, not a meta tag (Tauri manages
  nonces only for the config path).
- `rehype-sanitize` / streamdown configuration — sanitization behavior is not
  this plan.
- Any Rust command handlers; the capabilities files under
  `src-tauri/capabilities/`.

## Git workflow

- Branch: `advisor/002-csp-asset-scope`
- Conventional commits, e.g. `fix(security): enable CSP and scope asset protocol`
- A patch-level changeset is warranted (user-visible hardening): one-sentence
  body per the repo's changeset convention (see CLAUDE.md "Changesets").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Inventory real resource needs

Run `grep -rn "convertFileSrc\|asset://" src/ src-tauri/` and
`grep -rn "https://" src/components/streamdown-components.tsx src/features/conversation/ | head -30`.
Record: which directories asset:// serves, which remote origins images load
from, and any custom URI schemes registered in `src-tauri/src/lib.rs`
(`grep -n "register_uri_scheme\|register_asynchronous_uri_scheme" src-tauri/src/lib.rs`).

**Verify**: you can list every scheme/origin the policy must allow. Write the
list into your report.

### Step 2: Scope the asset protocol

Replace `"allow": ["**"]` with the narrowest globs covering the directories
found in Step 1 — expected shape (adjust to findings): the app data dir's
attachment/avatar cache, e.g. `"$APPDATA/**"` / `"$HOME/helmor/**"` and
`"$HOME/helmor-dev/**"` equivalents using Tauri's path variables. Do NOT
include `/` or `**` at the root.

**Verify**: `bun run dev`, open a workspace with image attachments and
avatars; images still render. `read_logs source=console` via the Tauri MCP
bridge shows no `asset protocol not allowed` errors.

### Step 3: Add a CSP, permissive-but-real first pass

Set in `tauri.conf.json`:

```json
"csp": {
    "default-src": "'self'",
    "script-src": "'self' 'wasm-unsafe-eval'",
    "style-src": "'self' 'unsafe-inline'",
    "img-src": "'self' asset: http://asset.localhost data: blob: https:",
    "font-src": "'self' data:",
    "connect-src": "'self' ipc: http://ipc.localhost",
    "worker-src": "'self' blob:"
}
```

Extend with the schemes found in Step 1 (custom protocols appear as
`<scheme>:` on macOS/Linux and `http://<scheme>.localhost` on Windows — add
both forms for each custom scheme).

**Verify**: `bun run dev`. Exercise ALL of: open a conversation and stream a
reply (markdown + code blocks render highlighted), open a file in the Monaco
editor (editor loads, syntax colors appear), open the inspector terminal
(xterm renders), open Settings. `read_logs source=console` → zero CSP
violation reports.

### Step 4: Tighten if cheap, document if not

If Step 3 passed with no violations, attempt removing `https:` from `img-src`
(re-test avatars; if they break, put it back — avatars are remote). Record
the final policy and the reason for each non-`'self'` source as a comment in
your report (JSON has no comments; the rationale goes in the commit message
body).

**Verify**: same manual pass as Step 3, still zero console CSP violations.

### Step 5: Run the suites

**Verify**: `bun run typecheck` → 0; `bun run test:frontend` → pass;
`cd src-tauri && cargo clippy --all-targets -- -D warnings` → 0 warnings.

## Test plan

No automated test can assert webview CSP behavior here; verification is the
manual matrix in Steps 3–4 plus console-log checks via the Tauri MCP bridge.
State in your report exactly which surfaces you exercised.

## Done criteria

- [ ] `grep -n '"csp": null' src-tauri/tauri.conf.json` → no matches
- [ ] `grep -n '\*\*' src-tauri/tauri.conf.json` → no `["**"]` in assetProtocol scope
- [ ] Manual matrix (stream, Monaco, terminal, settings, images) passed with
      zero CSP/asset-scope console errors — evidenced by MCP `read_logs` output
- [ ] `bun run typecheck` and `bun run test:frontend` exit 0
- [ ] `.changeset/*.md` patch entry exists, single-sentence body
- [ ] No files outside the in-scope list are modified (`git status`)

## STOP conditions

Stop and report back (do not improvise) if:

- Monaco or shiki cannot run under any policy without `'unsafe-eval'` in
  `script-src` — adding `'unsafe-eval'` defeats the point; report the exact
  console error instead.
- Step 1 reveals the asset protocol is intentionally used to serve arbitrary
  workspace files (not just app-data caches) — scoping would break a feature;
  report which feature.
- You cannot run the app (`bun run dev` fails in your environment) — the
  manual verification matrix is mandatory for this plan.

## Maintenance notes

- Any future feature loading remote content (new avatar source, embedded web
  previews) must extend the CSP deliberately — the console violation will be
  the symptom.
- Reviewer should scrutinize: each non-`'self'` CSP source against the Step 1
  inventory; whether both macOS and Windows forms of custom schemes are listed.
- Deferred: auditing `src-tauri/capabilities/` permission breadth (separate
  concern, smaller risk).
