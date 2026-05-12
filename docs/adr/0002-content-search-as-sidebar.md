# 0002 — Content search as a left-sidebar push-view, not a palette mode

Status: Accepted — 2026-05-12

## Context

We're adding two related-but-distinct file-finding surfaces:

- File quick-open (`Cmd+P`) — pick a file by name and open it.
- Workspace-wide content search (`Cmd+Shift+F`) — find text across many files, scan many hits, jump to specific lines.

The obvious shape is VS Code's: one palette dialog with prefix-mode-switching — `Cmd+P` opens it empty (file mode), typing `>` switches to commands, typing `#` switches to content search. This is the path the initial plan took.

But content search has a fundamentally different interaction profile than pick-and-act: users scan many hits, expand/collapse groups, navigate between matches over minutes, and frequently return to refine. A transient modal that closes on every result-open and disappears on Esc fights that workflow. And cmdk's built-in filtering would have to be bypassed for content mode (we filter server-side), forcing a hack to coexist within one component.

## Decision

Split the surfaces by binding and by UI shape.

- **`Cmd+P` / `Cmd+Shift+P`** — a single palette dialog (cmdk-based) with two modes selected by `>` prefix: fuzzy file search (default) and command-registry (`> ` prefix). Both are pick-one-and-act flows. Closes on selection.
- **`Cmd+Shift+F`** — a dedicated panel that **push-views** the left sidebar in place of the workspace list, with a Back button to pop back. Toggles open/closed via the same hotkey. Opening a result keeps the panel mounted so the user can pick another match. State (query, collapsed groups) preserved across toggle within the workspace session.

The push-view pattern mirrors `src/features/tasks/components/detail-screen.tsx`, which already uses the same column for a Back-button push.

## Consequences

**Positive:**

- Content search gets a persistent surface suited to its workflow. Users can keep results visible while jumping between matches; no modal dismissal churn.
- cmdk hosts only pick-and-act content (files + commands). Its built-in filtering works as designed; no bypass hack.
- Future content-search affordances (regex toggle, replace, recent queries) can land on the panel without bloating the palette.
- No new shell-layout machinery: the push-view reuses the existing left-sidebar column.

**Negative / risks:**

- Two surfaces to learn vs. VS Code's unified palette. The split is intentional and the hotkeys match VS Code's secondary convention (`Cmd+Shift+F` for find-in-files), so muscle memory transfers.
- The shortcut conflict with the prior `Cmd+Shift+P → Create PR` binding required moving that action to `Cmd+Alt+P`. Users with the previous binding need to re-bind if they want it back on `Cmd+Shift+P`.

## Rejected alternatives

- **Single palette with `#` prefix for content** — rejected: transient modal fights the "scan many hits across many files" workflow; cmdk filtering would have to be bypassed for the one mode that drives most usage of the surface.
- **Standalone third-column panel** (VS Code activity-bar style) — rejected: meaningful shell-layout change (new resize target, fit-to-window math, persistence) for a feature that's well-served by the existing column. Defer until we have a third tool that wants its own permanent panel.
- **Push-and-pop-on-open** — rejected: forces the user to re-open + retype to scan a second hit; the whole point of a content-search surface is iterating over results.
