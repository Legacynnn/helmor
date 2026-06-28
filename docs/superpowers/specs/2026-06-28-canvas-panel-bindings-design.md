# Canvas Panel Bindings + "All Panels" Popover — Design

Date: 2026-06-28
Status: Approved (pending spec review)
Area: `src/features/canvas/`, `src/features/shortcuts/`

## Summary

Give every canvas panel a ⌘+digit keyboard binding so the user can jump to it, and
add a frosted-glass popover that lists all panels with their bindings and lets the
user assign a custom digit.

- Auto bindings follow **creation order**: 1st panel → ⌘1, 2nd → ⌘2, … 9th → ⌘9
  (max 9 bound panels — see "Why ⌘1–⌘9 only" below).
- Pressing a binding **selects the panel and pans/zooms the viewport to center it**.
- A user can set a **custom** digit per panel (⌘1–⌘9) as long as it doesn't
  conflict with another panel's custom digit. Customs are managed in the popover.
- The popover opens from a button in the top-left workspace-controls cluster **and**
  via the `⌘/` shortcut.

No Rust/schema changes: the per-panel custom digit lives in the existing free-form
`canvas_panels.config` JSON, which round-trips as-is.

## Binding model

### Storage
Add an optional field to `PanelConfig` (`src/features/canvas/panel-config.ts`):

```ts
/** Custom ⌘+digit binding for this panel (1–9).
 * Absent = the panel uses an auto-assigned binding based on creation order. */
binding?: number;
```

### Why ⌘1–⌘9 only (not ⌘0)

The app's conflict engine (`getShortcutConflicts`) disables BOTH shortcuts that
share a hotkey when their scopes overlap, and the global `zoom.reset` already owns
`Mod+0` in the `app` scope (which overlaps every scope). A `canvas`-scope `Mod+0`
would mutually disable with `zoom.reset`. `Mod+1`–`Mod+9` are only taken by
`session.select1..9` in the `chat` scope, which does NOT overlap `canvas`, so those
are safe. Therefore bindings cap at 9 panels; the 10th+ show `—`.

Persists automatically via `stringifyPanelConfig` → `saveCanvasPanel` → `config` column.

### Resolution (pure)
`src/features/canvas/bindings/panel-bindings.ts` exports:

```ts
/** Digit sequence: ⌘1..⌘9 (max 9 bound panels). */
export const BINDING_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type PanelBindingInput = { id: string; binding?: number };

/** Resolve the effective digit for every panel.
 *  - Panels with a valid custom `binding` claim that digit.
 *  - Remaining panels, in array (creation) order, take the next free digit from
 *    BINDING_DIGITS, skipping claimed ones.
 *  - Panels past the 10 available digits get no binding (absent from the map).
 *  Returns Map<panelId, digit>. */
export function resolvePanelBindings(
	panels: PanelBindingInput[],
): Map<string, number>;

/** Format a digit as a label, e.g. 1 -> "⌘1", 0 -> "⌘0". */
export function formatBinding(digit: number): string;

/** True if assigning `digit` as a custom binding to `panelId` would collide with
 *  a DIFFERENT panel's existing CUSTOM binding. (Autos always flex, so they never
 *  conflict.) */
export function customBindingConflicts(
	panels: PanelBindingInput[],
	panelId: string,
	digit: number,
): boolean;
```

**Ordering source:** the canvas `nodes` array order, which reflects creation order
(DB `list_panels` returns `ORDER BY z ASC, created_at ASC`; new panels append, and
the chosen key action does not change `z`, so order stays stable across reloads).

**Compaction** is implicit: removing a panel shrinks the input list, so autos
renumber 1..N with no gaps on the next resolve.

**Validation:** a `binding` is honored only if it is an integer in `BINDING_DIGITS`
and unique among customs; the first panel (array order) wins a duplicate custom and
later duplicates fall back to auto (defensive — the UI prevents creating duplicates).

## Key action: focus a panel

`src/features/canvas/bindings/focus-panel.ts`:

```ts
/** Select only this panel and smoothly pan/zoom the viewport to center it. */
export function focusPanel(
	rf: ReturnType<typeof useReactFlow>,
	id: string,
): void;
```

Implementation: `rf.getNode(id)`; if missing, no-op. Else
`rf.setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })))`, compute the
node center from `position` + measured/`width`/`height`, and
`rf.setCenter(cx, cy, { zoom: clampedZoom, duration: 350 })`. `clampedZoom` keeps the
current zoom but clamps into `[0.6, 1.5]` so a far-zoomed-out user lands at a
readable zoom without a jarring jump.

## Shortcuts

Reuse the existing app shortcut system (`src/features/shortcuts/`), adding a new
`canvas` scope so canvas bindings are focus-scoped and never collide with chat's
existing `Mod+1..9` (scope `chat`).

Registry additions (`src/features/shortcuts/registry.ts`) — 9 panel jumps + the
popover toggle, all scope `["canvas"]`, group `"Navigation"`:

| id | defaultHotkey | title |
| --- | --- | --- |
| `canvas.panel1` … `canvas.panel9` | `Mod+1` … `Mod+9` | Jump to canvas panel N |
| `canvas.panelList` | `Mod+/` | Toggle the canvas panels list |

Add these 10 ids to the `ShortcutId` union, and add `"canvas"` to the
`ShortcutScope` type, in `src/features/shortcuts/types.ts`; also add `"canvas"` to
`KNOWN_SCOPES` in `src/features/shortcuts/focus-scope.ts`. Mark `editable: false`
(the hotkeys are fixed; the customization is *which panel* a digit maps to, owned by
the canvas — not a hotkey rebind).

`src/features/canvas/bindings/use-panel-binding-shortcuts.ts` builds the
`ShortcutHandler[]` for these ids and registers them with its **own**
`useAppShortcuts({ overrides: settings.shortcuts, handlers })` call — exactly the
pattern used by `inspector/panel/use-panel-shortcuts.ts`, `editor`, and
`workspace-start`. This hook lives inside the canvas tree (so it has `useReactFlow`).
`canvas.panelN` resolves the current digit→panel map (from live `rf.getNodes()` +
each node's parsed `binding`) and calls `focusPanel` for the panel holding digit N;
the handler is `enabled` only when such a panel exists. `canvas.panelList` toggles
the popover open-state store.

**No double-fire:** `useAppShortcuts` gates each registration on active scopes
(`registration.scopes.includes("app") || activeScopes.includes(scope)`). When the
canvas is engaged, `getActiveScopes()` returns `["canvas"]`, so the shell's
`session.select1..9` (scope `chat`) do NOT match while `canvas.panelN` does; when
chat is engaged, the reverse holds. Two `useAppShortcuts` window listeners coexist
fine — each only acts on its own matched, scope-active registration. (`stopPropagation`
between two capture-phase listeners on `window` doesn't suppress the other, but since
no `app`/`canvas` handler shares `Mod+1..9`/`Mod+/`, nothing else fires anyway.)

**Focus scope:** add `"canvas"` to `KNOWN_SCOPES` (focus-scope.ts) and tag the canvas
wrapper div in `index.tsx` with `data-focus-scope="canvas"`. Then a pointerdown/focus
anywhere on the canvas sets the engaged scope to `canvas` (the focus-scope module's
global `pointerdown` listener calls `rememberEngagement`), so `getActiveScopes()`
yields `["canvas"]`. Requirement: ⌘<digit> on the canvas focuses the mapped panel and
does NOT also trigger chat session-select.

## "All panels" popover

`src/features/canvas/chrome/panels-list-popover.tsx` — a `Popover` (shadcn, glass
styling consistent with `customize-popover.tsx`). Open state lives in a tiny zustand
store (`src/features/canvas/bindings/panels-list-store.ts`: `{ open, setOpen,
toggle }`) so both the workspace-controls button and the `canvas.panelList` shortcut
drive it.

Trigger: a new icon button (lucide `List`/`PanelsTopLeft`) added to the existing
`CanvasWorkspaceControls` cluster, with `aria-label="Panels"` and `cursor-pointer`.

Content: a scrollable list of panels in creation order. Each row:
- Binding badge: the effective `formatBinding(digit)` (e.g. `⌘1`), or `—` if unbound
  (10th+ panel).
- Label: the panel `title`, or `"<Type> #<n>"` when untitled (Type from
  `PANEL_META[panelType].label`, `n` = 1-based creation index).
- A digit picker (small `DropdownMenu` or segmented control) listing `Auto` + digits
  1–9; digits already held as another panel's **custom** binding are disabled;
  choosing a digit writes `config.binding` via `actions.patchNodeData`, choosing
  `Auto` clears it. Conflicts are prevented by disabling taken digits
  (`customBindingConflicts`).
- Clicking the row (outside the picker) calls `focusPanel` and closes the popover.

Empty state: "No panels yet" when the canvas has none.

## Files

New (`src/features/canvas/bindings/`):
- `panel-bindings.ts` — pure resolver + helpers (+ `panel-bindings.test.ts`).
- `focus-panel.ts` — select + center helper.
- `use-panel-binding-shortcuts.ts` — canvas shortcut handlers.
- `panels-list-store.ts` — popover open-state zustand store.

New chrome:
- `chrome/panels-list-popover.tsx` — the glass popover UI.

Edited:
- `panel-config.ts` — add `binding?: number` to `PanelConfig`.
- `shortcuts/registry.ts` + `shortcuts/types.ts` — `canvas` scope + 11 ids.
- `chrome/workspace-controls.tsx` — add the Panels button.
- `index.tsx` — mount `<PanelsListPopover />`, register the binding shortcut handlers,
  ensure the `canvas` focus scope on the wrapper.

## Testing

- **vitest (pure):** `panel-bindings.test.ts` —
  - auto assigns 1,2,3… in order; 9th gets 9; 10th gets nothing.
  - a custom binding claims its digit and autos flex around it (no gap, no dup).
  - compaction: removing a middle panel renumbers autos 1..N.
  - `customBindingConflicts` true only against another panel's custom (not autos).
  - `formatBinding` maps 1→"⌘1", 9→"⌘9".
- **vitest (component, light):** `panels-list-popover.test.tsx` — renders rows with
  the right badges and "<Type> #n" fallback labels for a small panel set; selecting a
  digit calls `patchNodeData` with `{ config }` containing the new `binding`.
- No Rust/`pipeline/`/`schema.rs` changes → no Rust snapshot tests required.

## Out of scope

- Persisting the popover open-state (transient, per-session).
- Surfacing canvas bindings in the global app shortcut-settings UI (the hotkeys are
  fixed; panel↔digit assignment is the only customization, done in the popover).
- Bindings for the 10th+ panel, chords, or non-⌘ modifiers.
- Reordering panels' creation order from the popover (drag-to-reorder).
