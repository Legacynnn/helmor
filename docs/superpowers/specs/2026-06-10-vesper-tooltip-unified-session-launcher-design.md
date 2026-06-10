# Vesper tooltip fix + unified session/terminal launcher + keybinds

Date: 2026-06-10

## Problem

Three related issues in the panel header session controls:

1. **Unreadable tooltips in the Vesper theme.** Icon-button tooltips (e.g. "New
   session") render as a solid white pill with invisible text.
2. **Two separate, confusing launch controls.** A `Plus` button creates a
   conversation; a separate `ChevronDown` dropdown lists "New conversation" plus
   detected terminal agents. Users want one control that clearly distinguishes
   the two session types.
3. **No dedicated keybind for terminal sessions.** Only `session.new` (Mod+T)
   exists; there is no shortcut to start a terminal session.

## Root cause (tooltip)

`src/components/ui/tooltip.tsx` styles the content pill with `bg-foreground` +
`text-background`. This produces a deliberately *inverted* tooltip in the
default light/dark themes (light pill, dark text).

In Vesper (`src/styles/color-theme.css`, `.dark.theme-vesper`):

- `--foreground` resolves to `--fg-default` = `oklch(0.985 0 0)` (near-white) →
  `bg-foreground` is a white pill.
- `--background` resolves to `--bg-base` = `oklch(0.17 0.004 65 / 0)` (fully
  transparent) → `text-background` is transparent text.

Result: white pill + transparent (effectively white) text = invisible. Vesper's
own design intent (per the file's comments) is that floating UI — menus,
popovers, dropdowns — stays **opaque** for legibility; the tooltip is the one
floating surface that was missed.

## Goals

- Tooltips are legible in Vesper without changing tooltip appearance in any other
  theme.
- A single launcher button opens one popover with **Conversation** and
  **Terminal** tabs.
- The terminal agent list is fully keyboard-navigable, with a per-agent
  quick-start key shown beside each agent.
- Dedicated, non-conflicting keybinds for conversation vs terminal sessions.

## Non-goals

- No change to how a conversation chooses its provider/model — that stays in the
  composer. The Conversation tab is a single "New conversation" action.
- No change to tooltip styling in non-Vesper themes.
- No new global (registry) keybinds for individual terminal agents — the
  per-agent quick keys are local to the open popover only.

## Design

### 1. Tooltip readability (Vesper-scoped)

Add a scoped rule to `src/styles/color-theme.css`, alongside the other
`html.theme-vesper` overrides:

```css
html.theme-vesper [data-slot="tooltip-content"] {
  /* Opaque dark pill + white text — matches Vesper's "floating UI stays
     opaque" rule; the default inverted (white-pill) tooltip is invisible here
     because --background is transparent. */
  background-color: var(--bg-overlay); /* opaque dark, oklch(0.175 0.005 65) */
  color: var(--fg-default);            /* near-white */
}
```

- Targets the Radix content slot (`data-slot="tooltip-content"`), so it covers
  every tooltip regardless of caller-supplied `className`.
- Uses existing Vesper tokens; no new variables.
- Verify the inline shortcut chips inside tooltips
  (`InlineShortcutDisplay`, used with `text-background/60`) remain legible
  against the new dark pill; if they wash out, the override should also normalize
  their color within Vesper tooltips.
- The shared `tooltip.tsx` component is **not** modified.

### 2. Unified launcher — one button, tabbed popover

**Component:** evolve `src/features/terminals/new-session-menu.tsx` into
`src/features/terminals/new-session-popover.tsx` — a Popover (not a bare
DropdownMenu) containing a two-tab surface.

**Trigger:** `src/features/panel/header.tsx` replaces *both* the `Plus`
`Button` (lines ~740–765) and the `NewSessionMenu` (lines ~767–772) with a
single `Plus` button that opens this popover. The button keeps its
`aria-label="New session"`, ghost/icon-sm styling, and tooltip.

**Tabs:**

- **Conversation** (default tab): a single primary "New conversation" action.
  - `Enter` (when this tab is active) triggers it.
  - Calls the existing `sessionActions.createSession()` path — unchanged
    behavior; provider/model still chosen later in the composer.
- **Terminal**: a keyboard-navigable list of detected terminal agents
  (`terminalAgentsQueryOptions`, filtered to `installed`, sorted first-class
  first — same data as today).
  - `↑` / `↓` move a highlight through the list (roving selection).
  - `Enter` starts the highlighted agent via `createTerminalSession(workspaceId,
    agent.id)` (existing path).
  - Each row shows a **quick-start key chip** on the right: digits `1`–`9`
    assigned by list order (agents beyond the 9th have no chip). Pressing a digit
    while the popover is open starts that agent immediately.
  - "Manage terminal agents…" stays as a footer action (opens settings via the
    existing `publishShellEvent({ type: "open-settings", section:
    "terminal-agents" })`).

**Tab switching:** `←` / `→` (and/or `Tab`) switches between Conversation and
Terminal; tabs are also clickable. Built on the existing `ui/tabs` primitive
where practical, or a lightweight equivalent that supports the roving keyboard
model above.

**Quick-key scope:** the digit quick-start keys are active **only while the
popover is open** (local keydown handling inside the popover), and do not touch
the global shortcut registry.

### 3. Keybinds

Canonical hotkey strings follow `normalizeShortcutEvent` ordering:
`metaKey→"Mod"`, `ctrlKey→"Control"`, `altKey→"Alt"`, `shiftKey→"Shift"`, then
the key — in that exact order, joined by `+`.

| Shortcut id | Title | Default | Scope | Behavior |
| --- | --- | --- | --- | --- |
| `session.new` (existing) | New session | `Mod+T` (unchanged) | `chat` | Instant "new conversation" (no popover) — preserves the fast path. |
| `session.reopenClosed` (existing) | Reopen closed session | **`Mod+Control+T`** (was `Mod+Shift+T`) | `app` | Unchanged behavior; only the default hotkey moves. |
| `session.newTerminal` (**new**) | New terminal session | **`Mod+Shift+T`** | `chat` | Opens the launcher popover focused on the **Terminal** tab. |

Notes:

- The **Plus button** opens the popover (Conversation tab). The **Mod+T
  shortcut** keeps instant-create. This is intentional: the button is the
  discoverable path, the shortcut is the power-user fast path.
- `session.newTerminal` opens the popover via the shell event bus: the global
  handler publishes an event (e.g. `{ type: "open-new-session", tab:
  "terminal" }`); `header.tsx` subscribes and opens the popover on that tab.
  (Mirror the existing `publishShellEvent` pattern; add the variant to the shell
  event type.)
- `Mod+Control+T` is confirmed free in the current registry.

## Files touched

| File | Change |
| --- | --- |
| `src/styles/color-theme.css` | Add Vesper-scoped `[data-slot="tooltip-content"]` override. |
| `src/features/terminals/new-session-popover.tsx` | New (evolves `new-session-menu.tsx`): tabbed popover, keyboard nav, per-agent quick keys. |
| `src/features/terminals/new-session-menu.tsx` | Removed/renamed into the popover component. |
| `src/features/panel/header.tsx` | Replace Plus button + NewSessionMenu with the single combined button + popover; subscribe to the open-popover shell event. |
| `src/features/shortcuts/registry.ts` | Change `session.reopenClosed` default → `Mod+Control+T`; add `session.newTerminal` (`Mod+Shift+T`, scope `chat`). |
| `src/features/shortcuts/types.ts` | Add `"session.newTerminal"` to the `ShortcutId` union. |
| `src/shell/hooks/use-global-shortcut-handlers.ts` | Register `session.newTerminal` handler → publish open-popover (Terminal tab) event. |
| Shell event bus (`src/shell/event-bus`) | Add the `open-new-session` (tab) event variant. |

## Testing

- `src/features/shortcuts/registry.test.ts`: assert the new `session.newTerminal`
  definition, the updated `session.reopenClosed` default, and no hotkey
  conflicts among `Mod+T` / `Mod+Shift+T` / `Mod+Control+T`.
- Update any existing test/snapshot that asserts `session.reopenClosed` ==
  `Mod+Shift+T` (e.g. `App.shortcuts.test.tsx`,
  `use-app-shortcuts.test.tsx` if applicable).
- Component test for the new popover: tab switching, `↑`/`↓` roving highlight,
  `Enter` starts highlighted terminal agent, digit quick-key starts the
  corresponding agent, Conversation-tab `Enter` creates a conversation.
- Manual: in Vesper, hover the New-session button and confirm the tooltip text is
  legible; confirm non-Vesper themes are visually unchanged.

## Risks / open considerations

- `ui/tabs` may not natively support the roving-list + digit-quick-key keyboard
  model; the popover may need a small custom keydown handler layered on top.
- The shell event bus must be the chosen mechanism for opening the popover from a
  global shortcut (no ad-hoc `app.emit` channels, per project conventions).
- Inline shortcut chips inside the Vesper tooltip must stay legible against the
  new dark pill (see §1).
