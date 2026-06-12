# Plan 009: Surface the Conductor migration path and CLI/MCP in the README

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2818226c..HEAD -- README.md docs/cli-and-mcp.md`
> If README already mentions Conductor or links docs/cli-and-mcp.md, parts of
> this plan landed independently — do only what's missing.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (docs only)
- **Depends on**: none
- **Category**: docs / direction
- **Planned at**: commit `2818226c`, 2026-06-11

## Why this matters

Two complete, shipped features are invisible at the front door:

1. **Conductor import** — a full migration UI exists
   (`src/features/settings/panels/conductor-import.tsx`, plus
   `src/features/settings/conductor-import-dialog.tsx` and backend commands),
   letting users of Conductor (the predecessor tool) import their workspaces.
   The README never says the word "Conductor". For the project's most likely
   adopter cohort, the migration story is undiscoverable.
2. **CLI & MCP server** — `docs/cli-and-mcp.md` (205 lines) documents a real
   CLI (`helmor workspace/session/send/...`), an MCP server mode, and the
   stacked-PR skills. The README's only doc pointer is an external Dosu link;
   it never mentions a CLI exists.

The README is currently install + a Dosu link + a joke contributing section
(verified below). Ten minutes of writing makes two finished features
discoverable.

## Current state

`README.md` at `2818226c` — full relevant content:

- Tagline: "Helmor is an open-source local workbench for multi-agent software
  development." Quote block: "AI made coding faster... Orchestrating,
  reviewing, testing, merging, and actually shipping software."
- `## Install` → "[**Download for macOS** →](https://github.com/dohooo/helmor/releases)"
- `## Documentation` → "[**Read the Helmor docs** →](https://app.dosu.dev/...)"
- `## Contributing` → "Open Helmor, Import Helmor, Ask Helmor: *'How do I
  contribute to Helmor?'* That's the guide."
- `## License` follows.

No "Conductor", no "CLI", no "MCP", no link to `docs/cli-and-mcp.md`.

In-app path for the import (verify before writing copy, the Settings layout
moves): Settings → the Conductor Import panel
(`src/features/settings/panels/conductor-import.tsx`).

Tone convention: the README is terse and a bit playful — match it; do not add
marketing prose or badges.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Lint (covers markdown via Biome? check) | `bun run lint` | exit 0 |
| Link check (manual) | open each added link target | resolves |

## Scope

**In scope**:
- `README.md`
- `docs/cli-and-mcp.md` — ONLY if it needs a one-line "Migrating from
  Conductor" cross-reference; no content rewrites.

**Out of scope**:
- The Dosu-hosted docs, app code, settings UI copy.
- Restructuring the README beyond adding two short sections.

## Git workflow

- Branch: `advisor/009-readme-conductor-cli`
- Conventional commit, e.g. `docs(readme): surface Conductor import and CLI/MCP`
- No changeset (docs only, not in-app).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the in-app path

Open `src/features/settings/panels/conductor-import.tsx` and
`src/features/settings/index.tsx` to confirm the panel's user-visible name
and where it sits in Settings navigation. Use the real labels in the copy.

**Verify**: you can quote the panel's displayed title from the code.

### Step 2: Add two README sections

After `## Documentation`, add (adjust labels per Step 1; keep within ~6 lines
each):

```markdown
## Migrating from Conductor

Helmor imports your existing Conductor workspaces. Open Helmor →
Settings → <actual panel name> and point it at your Conductor data.

## CLI & MCP

Helmor ships a companion CLI (`helmor`) and an MCP server, so scripts and
other agents can drive workspaces, sessions, and PR stacks.
[CLI & MCP reference →](docs/cli-and-mcp.md)
```

**Verify**: `grep -n "Conductor\|cli-and-mcp" README.md` shows both sections;
the relative link `docs/cli-and-mcp.md` resolves (file exists).

### Step 3: Lint

**Verify**: `bun run lint` → exit 0 (if Biome doesn't cover .md, note it and
skip).

## Test plan

None — docs change. Verification is the greps + link resolution above.

## Done criteria

- [ ] README contains a Conductor-migration section with the real Settings
      panel name
- [ ] README links `docs/cli-and-mcp.md`
- [ ] `git diff --stat` touches only README.md (and at most one cross-ref
      line in docs/cli-and-mcp.md)

## STOP conditions

- The Conductor import panel no longer exists or is gated/hidden (feature
  removed or reworked since planning) — report instead of documenting a ghost.

## Maintenance notes

- When the import flow's Settings location changes, this README copy is the
  thing that goes stale — keep the path description minimal ("Settings →
  <panel>") for that reason.
