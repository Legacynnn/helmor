# Plan-viewer: prototype live UI, Steps upgrade, header trim

**Date:** 2026-06-22
**Status:** Approved (design)
**Area:** `src/features/plan-viewer/`

## Problem

In the plan-viewer's prototyping block (`MultiPrototype`):

1. **Too many headers.** The block stacks three header-ish surfaces: the
   `PlanBlockShell` "Prototypes" header, a separate variant tab bar, and an inner
   bordered content box. It reads as redundant.
2. **No real UI.** Each `<Variant>` only renders nested markdown/plan blocks —
   a written description, not something that looks like the UI being proposed.

Separately, the `Steps` block is a plain wrapper around a markdown ordered list —
it should look like a real stepper.

## Goals

- Collapse the prototype block to a single header row.
- Let a variant render a **live React + Tailwind preview** of a UI mockup.
- Upgrade `Steps` into a connected visual stepper.

## Non-goals

- Updating the `prototype` / `visual-plan` authoring skills to emit the new
  `<Preview>` syntax. The renderer will support it; teaching agents to author it
  is deferred. The `<Preview>` syntax is documented below so it can be authored
  by hand in the meantime.
- Wiring previews to real app state. Previews are isolated, purely visual mockups.
- Offline preview support. Per decision, runtime assets load from CDN; offline
  renders the error state.

## Decisions (from brainstorming)

- **Preview engine:** live React/Tailwind, compiled in the browser.
- **Runtime assets:** loaded from CDN (React, ReactDOM, `@babel/standalone`,
  Tailwind Play), pinned versions.
- **Isolation:** sandboxed iframe via `blob:` URL + `sandbox="allow-scripts"`
  (opaque origin → no host access, no style leakage; Tauri CSP is `null` so CDN
  loads are not blocked).
- **Steps:** keep authoring as a plain list; upgrade rendering only (no new
  `<Step>` tag required).

## Design

### A. `MultiPrototype` — header trim + live UI

**Header trim.** Render a single header row using `PlanBlockShell`:
`LayersIcon` + "Prototypes" on the left, the **variant tabs pinned right** via
the shell's trailing/`badge` slot. The recommended variant keeps its ★. Variant
body renders directly in the shell body; the inner bordered box is removed.

Result: one header surface instead of three.

**Live UI via `<Preview>`.** A new plan component `<Preview>` with
`childMode: "raw"`; its raw text is a JSX/TSX snippet.

- `Preview` renders `LiveCodePreview`, which builds an HTML document (see
  `build-document.ts`) that loads React + ReactDOM + `@babel/standalone` +
  Tailwind Play from CDN, transforms the snippet, and mounts it into `#root`.
- The document runs in an iframe whose `src` is a `blob:` URL built from that
  HTML, with `sandbox="allow-scripts"`.
- **Authoring contract:** the snippet defines a component named `App`. The
  bootstrap appends `createRoot(document.getElementById("root")).render(<App/>)`.
- **States:** loading spinner until the iframe signals ready; an error panel for
  compile/runtime errors. Errors are caught inside the iframe (a wrapping
  `try/catch` + `window.onerror`) and `postMessage`'d to the host, which renders
  them in-panel rather than letting the iframe show a blank frame.
- **Auto-height:** a `ResizeObserver` inside the iframe `postMessage`s content
  height; the host sizes the iframe to fit, capped (~600px) then scrolls.

`<Preview>` works **standalone** and **inside `<Variant>`** with no special
casing — `MultiPrototype` renders each variant's body, and a body containing a
`<Preview>` gets a live mockup.

**`<Preview>` authoring syntax:**

```mdx
<Variant label="Compact" recommended="true">
<Preview>
function App() {
  return <button className="rounded bg-blue-600 px-3 py-1.5 text-white">Save</button>;
}
</Preview>
</Variant>
```

### B. `Steps` — visual stepper

- Change registry `childMode` for `Steps` from `"blocks"` to `"raw"`.
- `parse-steps.ts` splits the raw body into ordered step lines (handles `1.`,
  `-`, `*` markers). Optional `done:` / `active:` line prefixes set step status.
- `stepper.tsx` renders a connected vertical stepper: numbered circles joined by
  a connector line; each step's text rendered through `PlanMarkdown` so inline
  markdown (bold, code) still works. `done` → checkmark; `active` → accent.
- Authoring is unchanged (a numbered/bulleted list inside `<Steps>`); only the
  rendering is upgraded.

### C. Files

| Path | Change |
| --- | --- |
| `components/multi-prototype.tsx` | Move tabs into shell header trailing slot; drop inner border. |
| `components/preview/index.tsx` | New: `Preview` (raw childMode). |
| `components/preview/live-code-preview.tsx` | New: iframe host (blob URL, sandbox, height/error messaging, states). |
| `components/preview/build-document.ts` | New: builds the CDN + bootstrap HTML string. |
| `components/steps/index.tsx` | Promoted from `steps.tsx`; renders stepper. |
| `components/steps/parse-steps.ts` | New: parse raw lines → steps. |
| `components/steps/stepper.tsx` | New: connected numbered stepper UI. |
| `mdx/registry.tsx` | Register `Preview` (raw); change `Steps` childMode to `raw`. |

### Tests

- `multi-prototype.test.tsx`: updated for single-header layout + tabs in header;
  variant containing `<Preview>` renders the host.
- `preview/*.test.tsx`: `build-document` produces expected HTML (CDN tags,
  bootstrap, user snippet injected); `LiveCodePreview` renders loading then
  error/ready states. The iframe does not execute in jsdom — assert the built
  document string and host state machine, not live React execution.
- `steps/*.test.ts(x)`: `parse-steps` line/marker/status parsing; `stepper`
  renders numbers, connectors, and `done`/`active` states.

## Risks

- **CDN availability / version drift:** mitigated by pinned versions; offline or
  CDN outage surfaces the error panel (acceptable per decision).
- **Snippet authoring errors:** surfaced via the in-panel error state rather than
  a blank/broken iframe.
- **Unused capability:** without the deferred skill update, `<Preview>` is only
  reachable by hand-authored plans. Documented above; revisit when authoring is
  in scope.
