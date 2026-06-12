# Plan 005: Remove Storybook (2 stories, full CI job, zero payoff)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2818226c..HEAD -- package.json .storybook .github/workflows/build.yml`
> Also re-run `find src -name "*.stories.tsx"` — if there are now more than
> the 2 stories listed below, treat it as a STOP condition (the team started
> investing in Storybook; removal is no longer the right call).

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `2818226c`, 2026-06-11

## Why this matters

Storybook 10 plus six addon packages sit in devDependencies, a `.storybook/`
config exists, and CI runs a dedicated **macOS** "Storybook Build" job on every
PR (`.github/workflows/build.yml`, the `bun run build-storybook` step) — all to
serve exactly **2** story files. That's a meaningful chunk of install weight,
`bun audit` noise (storybook's transitive chain includes several of the
flagged dev-time CVEs), and paid macOS CI minutes per PR, for tooling nobody
uses. The maintainer approved removal (advisor session, 2026-06-11).

## Current state

Verified at `2818226c`:

- Stories: `src/features/composer/composer-interaction-states.stories.tsx`,
  `src/features/inspector/panel/git/header.stories.tsx` — the only two.
- Config: `.storybook/main.ts`, `.storybook/preview.tsx`.
- `package.json` scripts: `"storybook": "storybook dev -p 6006"`,
  `"build-storybook": "storybook build"`.
- `package.json` devDependencies: `@chromatic-com/storybook`,
  `@storybook/addon-a11y`, `@storybook/addon-docs`,
  `@storybook/addon-onboarding`, `@storybook/addon-vitest`,
  `@storybook/react-vite`, `storybook` (all `^10.3.5` except chromatic `^5.1.2`).
- CI: `.github/workflows/build.yml` has a `Storybook Build` job
  (runs-on macos-latest, step `run: bun run build-storybook`) alongside the
  app-build job (`run: bun run build` at line 37 — that one STAYS).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun run typecheck`      | exit 0              |
| Lint      | `bun run lint`           | exit 0              |
| Frontend tests | `bun run test:frontend` | all pass       |
| Build     | `bun run build`          | exit 0              |

## Scope

**In scope**:
- `package.json` (scripts + devDependencies), `bun.lock` (regenerated)
- `.storybook/` (delete directory)
- The 2 `*.stories.tsx` files (delete)
- `.github/workflows/build.yml` (remove the Storybook job only)
- `vitest.shims.d.ts` / `vite.config.ts` / `tsconfig.json` — ONLY if they
  reference storybook (check first; see Step 3)

**Out of scope** (do NOT touch):
- The app-build job in `build.yml` (`bun run build`) — keep it.
- Any component the stories rendered (`composer`, inspector git header) —
  deleting a story must not touch its subject.
- Other workflows (`quality.yml`, `test.yml`, `publish.yml`, ...).

## Git workflow

- Branch: `advisor/005-remove-storybook`
- Conventional commit, e.g. `chore(dx): remove storybook (2 stories, unused)`
- No changeset (not user-visible).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Find every storybook reference

`grep -rn "storybook\|stories" package.json vite.config.ts vitest.shims.d.ts tsconfig.json biome.json .github/ --include="*" -il`
plus `grep -rn "addon-vitest\|@storybook" src/ .storybook/ -l`.
The `@storybook/addon-vitest` entry matters: check whether the vitest config
(`vite.config.ts` or a `vitest.workspace.*`) wires a storybook test project.

**Verify**: you have the complete reference list; paste it in your report.

### Step 2: Delete stories, config, scripts, deps

Delete the 2 story files and `.storybook/`. Remove the two scripts and all 7
storybook-related devDependencies from `package.json`. Run `bun install`.

**Verify**: `grep -rin "storybook" package.json src/ .storybook 2>/dev/null` →
no matches; `bun install` exit 0.

### Step 3: Clean residual config

Remove any references found in Step 1 from vite/vitest/tsconfig configs.

**Verify**: `bun run typecheck` → 0; `bun run test:frontend` → all pass;
`bun run lint` → 0.

### Step 4: Remove the CI job

In `.github/workflows/build.yml`, delete the entire `Storybook Build` job
(name, runs-on, steps including `bun run build-storybook`). Leave the app
build job intact.

**Verify**: `grep -n "storybook" .github/workflows/*.yml` → no matches;
the YAML still parses (`bun x yaml-lint` if available, otherwise
`node -e "require('js-yaml')"`-style check or careful re-read — a broken
workflow file fails every PR).

### Step 5: Full build

**Verify**: `bun run build` → exit 0.

## Test plan

No new tests. The done criteria are the regression net: existing suites pass
and nothing imports storybook.

## Done criteria

- [ ] `grep -rin "storybook" package.json src/ .github/ .storybook 2>/dev/null` → no matches
- [ ] `find src -name "*.stories.tsx"` → empty
- [ ] `bun run typecheck`, `bun run test:frontend`, `bun run lint`,
      `bun run build` all exit 0
- [ ] `bun.lock` no longer contains `"storybook"` entries
- [ ] No files outside the in-scope list are modified (`git status`)

## STOP conditions

Stop and report back (do not improvise) if:

- More than 2 story files exist now (team started investing — removal needs
  re-confirmation).
- `@storybook/addon-vitest` turns out to be load-bearing for the existing
  vitest suite (tests fail after removal in a way that isn't a trivial config
  cleanup).
- Anything in `src/` (non-story code) imports from a storybook package.

## Maintenance notes

- If interactive component development is wanted later, prefer a lighter tool
  (Ladle) or tests-as-docs; re-introducing Storybook should be a deliberate
  decision with stories actually written.
- Reviewer: confirm the deleted CI job is the storybook one and the app-build
  job (`bun run build`) survives — that job is the repo's only PR-gating
  frontend build (see rejected finding "no build in CI" in plans/README.md).
- Re-run `bun audit` after this and plan 001 land; most current noise should
  be gone, and what remains is signal.
