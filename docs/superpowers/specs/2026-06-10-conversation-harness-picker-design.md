# Conversation Harness Picker — Design

**Date:** 2026-06-10
**Status:** Approved (design)

## Problem

When the user clicks the "+" launcher in the panel header, the popover shows two
tabs: **Conversation** and **Terminal**. The Terminal tab already lists the
installed terminal CLI agents to pick from. The Conversation tab, however, only
offers a single generic "New conversation" button — it always starts a Claude
conversation, giving the user no way to choose which harness (SDK provider) the
conversation runs on.

We want the Conversation tab to list the available conversation harnesses
(Anthropic/Claude SDK, Codex, OpenCode, Cursor) connected through their SDKs, and
let the user pick one. Selecting a harness creates a conversation bound to that
harness.

## Decisions (from brainstorming)

1. **Harness source:** Reuse the existing model catalog. The four
   conversation-capable harnesses are exactly the catalog sections already
   surfaced by `agentModelSectionsQueryOptions()` → `list_agent_model_sections`
   (`catalog.rs`): `claude`, `codex`, `opencode`, `cursor`. We do not introduce a
   separate "native" concept — we show whatever the catalog reports as available.
2. **Selection granularity:** Picking a harness creates a conversation seeded
   with that harness's **default model** = the section's first option
   (`section.options[0].id`). The user can still change the model later in the
   composer.
3. **Unavailable harnesses:** Hidden entirely. A harness is shown only when
   `section.status === "ready"` AND it has at least one model option. This yields
   Claude + Codex always; OpenCode / Cursor only when configured/connected.

## Why no backend changes

The backend already supports this end to end:

- `agentModelSectionsQueryOptions()` (`src/lib/query-client.ts`) exposes the
  catalog with per-section `status` and `options`.
- `createSession(workspaceId, { model })` (`src/lib/api.ts`) already accepts an
  optional `model`, and the backend (`resolve_model` in `catalog.rs`) infers the
  provider from the model id (e.g. `gpt-*` → codex, `cursor-*` → cursor, slug
  with `/` → opencode, else claude).

So this is a **frontend-only** change plus threading an optional `model` argument
through the existing conversation-creation call chain. No changes to `catalog.rs`,
the `create_session` command, `schema.rs`, or the message pipeline — therefore no
Rust snapshot tests are affected.

## Architecture / Data flow

```
NewSessionPopover (Conversation tab → harness list)
  └─ onCreateConversation(modelId?)                 // signature gains optional modelId
      └─ panel/header.tsx: sessionActions.createSession(modelId)
          └─ use-session-actions.ts: createSession(workspace.id, { model: modelId })
              └─ existing IPC create_session → session.model set → provider inferred
```

`onCreateConversation` (in `new-session-popover.tsx`) and `createSessionAction`
(in `use-session-actions.ts`) gain an **optional** `model` argument. All existing
callers that pass nothing keep today's behavior (Claude default): the `Mod+T`
shortcut, the auto-create path in `panel/container.tsx`, and the session-close
replacement path in `session-close.ts`.

## Components

### `src/features/terminals/new-session-popover.tsx` (primary change)

- Add a query for `agentModelSectionsQueryOptions()` (enabled when the popover is
  open), alongside the existing terminal agents query.
- Derive `harnesses` = sections filtered to `status === "ready"` &&
  `options.length > 0`.
- Replace the single "New conversation" button with a list of harness rows:
  - Row content: provider icon + section `label` (e.g. "Claude Code", "Codex",
    "OpenCode", "Cursor"), reusing the composer's existing provider/`ModelIcon`
    component for visual consistency.
  - `onClick` → `startConversation(section.options[0].id)`.
- Keyboard UX (mirror the Terminal tab, which already implements this):
  - ↑/↓ move highlight within the harness list.
  - `1`–`9` quick-keys launch the Nth harness.
  - `Enter` launches the highlighted harness.
  - ←/→ switch tabs.
  - Default highlight = first harness (Claude), so `Enter` still creates a Claude
    conversation as before.
- States: show "Detecting harnesses…" while the query is pending; defensive
  fallback to a plain "New conversation" (no model arg) if the list is empty.

### `src/features/panel/header.tsx`

- `onCreateConversation={(model) => void sessionActions.createSession(model)}`.

### `src/features/panel/header/use-session-actions.ts`

- `createSessionAction(model?: string)` → `createSession(workspace.id, model ? { model } : undefined)`.
- `seedNewSessionInCache` call unchanged (model is persisted server-side; the
  composer resolves the selected model from `session.model` via existing
  `inferDefaultModelId` / `findModelOption` helpers).

## Error handling

- Catalog query error / empty: fall back to the plain "New conversation" entry so
  the user is never blocked from starting a (Claude default) conversation.
- `createSession` failure: existing `console.error` + toast path is reused.

## Testing

Frontend (vitest), co-located:

- `new-session-popover` test:
  - Renders only `ready` harnesses with options; hides `unavailable` ones and
    sections with no options.
  - Clicking a harness calls `onCreateConversation` with that section's first
    model id.
  - Pending state shows the detecting message.
- `panel/header` (or `use-session-actions`) test: `onCreateConversation(modelId)`
  results in `createSession` being called with `{ model: modelId }`; calling with
  no arg calls `createSession` with no model.

No Rust/pipeline snapshot work (no backend/storage changes).

## Out of scope

- Adding a brand-new "native" harness type.
- Per-model selection inside the Conversation tab (harness → default model only).
- Persisting a separate `provider` column on sessions (provider stays inferred
  from `model`, as today).
