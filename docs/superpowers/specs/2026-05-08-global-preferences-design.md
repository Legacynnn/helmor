# Global Repo Preferences — Design

**Date:** 2026-05-08
**Status:** Approved (design phase)

## Problem

Today, every repository in Helmor has its own copy of six "custom prompt" preferences (`createPr`, `review`, `fixErrors`, `resolveConflicts`, `branchRename`, `general`). There is no notion of an app-level template, so users who want consistent prompts across many repos must edit each repo individually. There is also no way to roll out a prompt change to existing repos.

## Goal

Introduce **global preferences** that act as a per-field template. Each repo can independently *follow* the global value for any given field or *override* it. Editing a global field propagates to all repos that follow it.

## Non-goals

- No per-workspace overrides (workspaces continue to inherit from their repo).
- No history / undo of global edits beyond what the DB already records.
- No diff UI showing global-vs-override side by side (placeholder text is sufficient).

## User-facing behaviour

### Global preferences panel

A new section in the settings dialog, "Global preferences", with the same six textareas as the existing repo preferences panel. Saving updates the app-level template.

### Repo preferences panel

Each of the six fields gains:

- A badge top-right of the textarea: `Following global` (muted) when inherited, `Overridden` (accent) when the repo has its own value.
- Placeholder text showing a truncated preview of the global value, so the user can see what they'd inherit without leaving the panel.
- **Auto-detach on edit** — typing into a field that is currently following global flips it to overridden. The override starts as the user's typed text.
- A **Reset to global** link, shown only when overridden. Re-attaches the field to global. The previous override text is *retained* in storage so that re-overriding restores it.

### Propagation toast

After a global save, a single non-blocking toast:

> Updated global preferences · N repositories follow these changes

Where N is the count of repos following at least one of the fields that changed in this save. If no repo follows any of the changed fields, no toast is shown.

## Data model

### Global storage

Use the existing key/value `settings` table (`src-tauri/src/models/settings.rs`). Single key `global_repo_preferences`, value is JSON matching the existing `RepoPreferences` shape. No new table.

### Per-repo inheritance flags

Add six BOOLEAN columns to the `repos` table:

```sql
ALTER TABLE repos ADD COLUMN inherit_global_create_pr         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repos ADD COLUMN inherit_global_review            INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repos ADD COLUMN inherit_global_fix_errors        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repos ADD COLUMN inherit_global_resolve_conflicts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repos ADD COLUMN inherit_global_rename_branch     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repos ADD COLUMN inherit_global_general           INTEGER NOT NULL DEFAULT 0;
```

The existing `custom_prompt_*` columns are unchanged. When the inherit flag is true, the `custom_prompt_*` column is ignored at resolution time but its content is preserved (so toggling back to overridden restores the previous text).

### Migration (idempotent, in `schema.rs`)

For every existing repo row, on first run after the upgrade:

```sql
UPDATE repos SET inherit_global_create_pr = 1
  WHERE custom_prompt_create_pr IS NULL OR custom_prompt_create_pr = '';
-- (and the same for the other five fields)
```

New repos created after this migration default all six flags to `1` so they pick up the global template by default. The repo-creation path (`models::repos::create_repo` or equivalent) sets the defaults explicitly rather than relying on column defaults, to make the behaviour grep-able.

## Resolution

### Backend struct

```rust
pub struct InheritFlags {
    pub create_pr: bool,
    pub review: bool,
    pub fix_errors: bool,
    pub resolve_conflicts: bool,
    pub branch_rename: bool,
    pub general: bool,
}

pub struct RepoPreferencesResolved {
    pub overrides: RepoPreferences,  // raw stored values from custom_prompt_*
    pub inherit:   InheritFlags,
    pub global:    RepoPreferences,  // current global snapshot
    pub effective: RepoPreferences,  // per-field: inherit ? global : override
}
```

`effective` is the value sent into the existing prompt-resolution helpers (`resolveRepoPreferencePrompt`, `resolveGeneralPreferencePrefix` in `src/lib/repo-preferences-prompts.ts`; `agents/queries.rs:139`). Those helpers do not change — they continue to take a `RepoPreferences` and behave identically.

### IPC surface

- `load_global_preferences() -> RepoPreferences` (new)
- `update_global_preferences(prefs: RepoPreferences) -> GlobalPreferencesUpdateSummary` (new) — `summary.repos_affected` is a `u32` of repos following any field that actually changed in this save.
- `load_repo_preferences(repo_id) -> RepoPreferencesResolved` (changed shape; single frontend caller updated in lockstep).
- `update_repo_preferences(repo_id, overrides: RepoPreferences, inherit: InheritFlags)` (changed signature).

## Frontend

- New `GlobalPreferencesSection` component, structurally identical to `repository-preferences-section.tsx` but bound to the global IPC commands.
- New entry in the settings dialog's section list, alongside the existing repo preferences entry.
- `repository-preferences-section.tsx` updated to:
  - render the badge per field;
  - read the global preview for placeholder text;
  - auto-flip `inherit_<field>` to false on user edit;
  - render the **Reset to global** link when overridden;
  - submit both `overrides` and `inherit` to the changed `update_repo_preferences` IPC.
- After a successful `update_global_preferences`, the panel triggers a toast using the returned `repos_affected` count (suppressed when zero).

## Tests

- **Rust integration test (`src-tauri/tests/`)** for the migration: seed legacy `repos` rows with mixed NULL / empty / populated `custom_prompt_*` values, run the migration, assert each `inherit_global_*` flag.
- **Pipeline snapshot test** (`src-tauri/tests/pipeline_scenarios.rs`) covering effective-prompt resolution with a mix of inherited and overridden fields, including the `general` prefix path.
- **Rust unit tests** in `models/repos.rs` for `load_repo_preferences` and `update_repo_preferences` round-trips covering: all-inherited, all-overridden, mixed; verifying that overrides survive a toggle to inherit and back.
- **Vitest** in `repository-preferences-section.test.tsx`: badge state, auto-detach on edit, reset-to-global behaviour, placeholder rendering.
- **Vitest** for the new `GlobalPreferencesSection`: load + save round-trip, toast firing with non-zero count, toast suppression at zero.

## Out of scope / explicit deferrals

- Bulk operations across repos beyond the global propagation itself (e.g. "set all repos to override with this text") are not in this design.
- No telemetry on global-edit propagation counts beyond the toast.
- Workspace-level overrides remain unchanged.
