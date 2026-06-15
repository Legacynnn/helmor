# Vesper terminal translucency — design

**Date:** 2026-06-14
**Status:** Implemented (see "Resolution" below)

## Resolution (actual root cause)

Live debugging revealed the black terminals were NOT primarily a layering problem.
An on-screen probe of the computed backgrounds showed three stacked causes:

1. **xterm.css hardcodes `.xterm-viewport { background-color: #000 }`** — an
   opaque black layer covering the whole terminal, defeating `allowTransparency`,
   the transparent xterm theme background, and the themed wrapper. Fixed with a
   `.xterm .xterm-viewport { background-color: transparent !important }` override
   in `App.css`.
2. **xterm's WebGL renderer paints an opaque black background in WKWebView**
   (ignores the background alpha). Fixed in `terminal-output.tsx` by skipping the
   WebGL addon whenever the terminal surface is translucent (Vesper), falling back
   to the transparency-honoring DOM renderer. Re-evaluates on theme switch. Opaque
   themes keep WebGL (no perf change).
3. **The Vesper terminal tint was too dark/heavy** (`oklch(0.16 … / 0.45–0.62)`),
   so even when fully transparent it read as near-black. Lightened to
   `oklch(0.2 … / 0.42)` (inspector) and `0.45` (center).

The layering work from the original design still applies and was kept:
- Center terminal: `data-center-surface="terminal"` opens a `:has()` blur tunnel
  through the otherwise-opaque viewport (windowed + fullscreen).
- Inspector terminals: the doubled `bg-inspector` glass is collapsed to a single
  layer in Vesper so the terminal sits on one glass layer over the blur.

Files changed: `src/components/terminal-output.tsx`, `src/App.css`,
`src/styles/color-theme.css`, `src/features/panel/index.tsx`,
`src/features/terminal/terminal-session-panel.tsx`.

---

## Original design (pre-implementation)

> Note: the sections below were written before debugging and assumed layering was
> the sole cause. Kept for history; the Resolution above is authoritative.

## Problem

In the Vesper theme (translucent macOS dark glass), the terminal surfaces should
read as frosted glass like the rest of the Vesper chrome. Today:

- **Inspector terminals** (bottom-right Run / Terminal / Setup tabs) already work.
  They sit inside the inspector pane, whose background (`bg-inspector` →
  `--inspector-bg` → `--bg-surface`) is `oklch(0.2 0.005 65 / 0.5)` (50%
  translucent). The terminal tint (`--terminal-background` →
  `--terminal-chrome-bg` = `oklch(0.16 0.004 65 / 0.45)`) layered over that glass
  lets the native NSVisualEffectView blur show through.

- **The center CLI-agent terminal** (the new Terminal Mode `TerminalSessionPanel`
  rendered in the message area) does **not** look translucent. It uses the same
  translucent `--terminal-background` token, but its ancestor
  `[aria-label="Workspace viewport"]` is forced to `oklch(0.16 0.004 65 / 0.9)`
  (90% opaque) in Vesper. That layer is opaque on purpose — it protects chat and
  editor reading text from sitting on the blur — and it blocks the blur from ever
  reaching the terminal below it.

**Root cause:** the center terminal's translucent surface is painted on top of a
90%-opaque ancestor. The fix is to open a transparent "tunnel" from the native
blur down to the terminal **only when a terminal session is the active center
view**, while leaving chat/editor at their protective opacity.

## Goals

- The center CLI-agent terminal reads as frosted glass in Vesper, consistent with
  the inspector terminals.
- Center terminal is **denser/darker** than the inspector terminals so agent
  output stays maximally readable (user preference: "subtle / denser glass").
- Chat and editor views keep their current ~0.9-opaque viewport — readability of
  prose is not regressed.
- Non-Vesper themes are visually unchanged (they already inherit theme color via
  `--terminal-chrome-bg`).
- No Rust/sidecar changes. CSS + minimal markup only.

## Non-goals

- Changing the inspector terminals' appearance (they already work). They remain
  the 0.45-alpha reference; only the center terminal is added to the same family.
- Reworking the broader Vesper layering for chat/editor.
- Any light-mode / non-Vesper behavior.

## Design

### 1. Mark the center view as terminal-active (markup)

In `src/features/panel/index.tsx`, the WorkspacePanel root (`<div className="…
bg-panel">`, currently line ~153) gains a data attribute reflecting whether a
terminal session is the visible center surface:

```tsx
<div
  className="flex min-h-0 flex-1 flex-col bg-panel"
  data-center-surface={visibleTerminalId ? "terminal" : undefined}
>
```

- `visibleTerminalId` is already in scope in this component.
- Attribute is omitted (not `"chat"`) when no terminal is visible, so the
  selector below simply doesn't match in chat/editor mode.
- Pure markup; no behavior, state, or render-path change.

### 2. Open the blur tunnel — Vesper, windowed (CSS)

In `src/styles/color-theme.css`, add a scoped rule that makes the otherwise-opaque
viewport transparent **only** when it contains a terminal-active panel, using
`:has()` (supported in the app's WKWebView):

```css
/* Terminal sessions want the same frosted glass as the inspector terminals, but
   the center viewport is deliberately ~0.9 opaque to protect chat/editor text.
   Open the tunnel only when a terminal session is the visible center surface so
   the native blur reaches the terminal; chat/editor keep their opaque viewport. */
html.theme-vesper.dark
  [aria-label="Workspace viewport"]:has([data-center-surface="terminal"]) {
  background-color: transparent;
}
```

The intermediate `bg-panel` layer is already transparent in Vesper
(`--panel-bg` → `--bg-base` = 0 alpha), so no extra zeroing is needed there.

### 3. Denser glass tint for the center terminal (CSS)

Override `--terminal-background` on the terminal-active panel so the center
terminal is a touch denser than the inspector's 0.45, while staying clearly
translucent. Because `TerminalOutput` reads `var(--terminal-background)` from its
wrapper, setting the variable on an ancestor cascades to it:

```css
/* Center CLI-agent terminal: denser than the inspector terminals (0.45) so agent
   output stays readable, while still reading as frosted glass. */
html.theme-vesper.dark [data-center-surface="terminal"] {
  --terminal-background: oklch(0.16 0.004 65 / 0.62);
}
```

Target alpha ~0.62 (final value tuned visually during implementation, within
0.58–0.66). Inspector terminals are untouched at 0.45.

### 4. Vesper fullscreen

In fullscreen, the blur comes from CSS `backdrop-filter` on the viewport rather
than native vibrancy, and the viewport is `--vesper-fullscreen-viewport-bg`
(`oklch(0.165 0.005 65 / 0.72)`). When a terminal session is active, lower the
viewport density so the in-window material shows through, mirroring §2:

```css
html.vesper-fullscreen.theme-vesper.dark
  [aria-label="Workspace viewport"]:has([data-center-surface="terminal"]) {
  background-color: oklch(0.165 0.005 65 / 0.4);
}
```

The existing fullscreen `backdrop-filter` rule already applies to
`[aria-label="Workspace viewport"]`, so the blur material is present; only the
density needs lowering. The denser `--terminal-background` override in §3 already
applies (it is not scoped to windowed-only); fullscreen `--terminal-chrome-bg`
(0.62) is overridden by the same `[data-center-surface="terminal"]` rule, which is
acceptable — the center terminal stays in the 0.58–0.66 band in both modes.

### 5. Booting overlay

In `src/features/terminal/terminal-session-panel.tsx`, the "Starting agent…"
overlay currently uses `bg-panel`, which is transparent in Vesper → the spinner
would float directly over the desktop blur. Switch it to the terminal surface so
it reads as the terminal coming up:

```tsx
<div className="absolute inset-0 z-10 flex items-center justify-center"
     style={{ backgroundColor: "var(--terminal-background)" }}>
```

This inherits the denser center tint in Vesper and the opaque `--terminal-chrome-bg`
in other themes (unchanged appearance off-Vesper).

## Files touched

| File | Change |
| --- | --- |
| `src/features/panel/index.tsx` | Add `data-center-surface` attribute on WorkspacePanel root. |
| `src/styles/color-theme.css` | Add Vesper windowed tunnel rule, fullscreen tunnel rule, and denser center `--terminal-background` override. |
| `src/features/terminal/terminal-session-panel.tsx` | Booting overlay uses `var(--terminal-background)` instead of `bg-panel`. |

## Testing / verification

- **Manual (primary):** Switch to Vesper, open a CLI-agent (Terminal Mode)
  session; confirm the center terminal reads as frosted glass with the desktop
  blur behind it, denser than the inspector Run/Terminal/Setup terminals but with
  readable output. Switch back to a chat session and confirm chat/editor keep
  their opaque viewport (no blur bleed behind prose). Repeat in Vesper fullscreen.
- **Non-Vesper regression:** In a default dark theme, confirm the center terminal
  and booting overlay look unchanged (opaque, theme-colored).
- **No pipeline/persistence impact:** changes are presentation-only (CSS + one
  markup attribute + one overlay background), so no `src-tauri/tests/` snapshot
  coverage is required. Run `bun run lint` and `bun run typecheck` to confirm no
  regressions.

## Risks

- `:has()` support — fine in the app's WKWebView; the rule degrades gracefully
  (terminal stays opaque) if unsupported.
- Readability at higher translucency — mitigated by the denser center tint and a
  visual tuning pass within the 0.58–0.66 band.
