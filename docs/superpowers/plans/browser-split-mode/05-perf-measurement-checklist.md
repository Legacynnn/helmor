# Perf Hardening — Manual HUD/RSS Measurement Checklist

> These legs CANNOT be executed headlessly — they require a live GUI with the
> perf HUD overlay and (for memory) Activity Monitor / `ps`. The GUARD/code
> tasks (1, 2, 3, 4-guard, 5-guard, 6-guard) are already implemented and
> committed with passing automated tests. This file captures the **measurement
> legs** of Task 4 and the entirety of Tasks 7 and 8, with the exact procedure
> and PASS thresholds (verbatim from `05-perf-hardening.md`) so a human can run
> them.

## How to read frame timings (used by every measurement)

1. Launch with the HUD on: `VITE_HELMOR_PERF_HUD=1 bun run dev` (or `bun run dev:analyze`).
2. The HUD is a fixed black overlay at bottom-left showing `FPS`, `worst 5s: <ms>`, `long frames: <n>`.
3. Before each measured interaction, open devtools console and run
   `window.__HELMOR_LONG_FRAMES__.clear()` to reset the ring buffer and rolling
   worst-frame.
4. Perform the interaction, then read evidence with
   `window.__HELMOR_LONG_FRAMES__.dumpJson()` (or `.get()` for the raw
   `LongFrameEntry[]`, `.worstFrameMs()` for the rolling worst). A "long frame"
   is any frame `> 50ms`; the buffer length is the `long frames` HUD counter.
5. PASS thresholds below are in terms of these exact readings.

> **WebKit caveat** (documented in `dev-long-frames.ts`): in the Tauri
> dev/release WKWebView the LoAF collector does not fire; the rAF fallback is
> the real source of truth. Read FPS + worst-frame from the rAF path. Do all
> measurements inside the Tauri webview (`bun run dev`), never a plain browser
> tab.

---

## Task 4 — MEASUREMENT leg: full-page capture causes no chat jank

With `VITE_HELMOR_PERF_HUD=1 bun run dev`:

- [ ] Open Split Mode, navigate the browser to a long page (a docs page that
      scrolls several viewports).
- [ ] Click into the chat composer and start typing a sentence continuously.
- [ ] While typing, trigger **full-page scroll-and-stitch capture** from the
      browser toolbar.
- [ ] Read `window.__HELMOR_LONG_FRAMES__.dumpJson()`.
- [ ] **PASS:** during the capture, no `raf`-source long frame `> 80ms` appears
      in the buffer, FPS stays `>= 45`, and the chat caret keeps up with typing
      (no visible stall). Diff against a baseline run with no capture: the
      long-frame count must not increase by more than 1 attributable to the
      capture.

---

## Task 7 — No dropped frames opening/closing/splitting/expanding the surface

- [ ] Launch: `VITE_HELMOR_PERF_HUD=1 bun run dev`. Confirm the HUD overlay
      shows at bottom-left.
- [ ] Open a workspace with an active chat thread so chat content is rendering.
- [ ] `window.__HELMOR_LONG_FRAMES__.clear()`.
- [ ] **Interaction script** (perform in order, ~1s between steps):
  - [ ] `Cmd+Shift+B` → open Split Mode (browser appears beside chat).
  - [ ] Drag the split divider left/right across its full range twice.
  - [ ] `Cmd+Shift+Enter` → expand the browser to full-pane.
  - [ ] `Cmd+Shift+Enter` → restore to split.
  - [ ] `Cmd+Shift+B` → close Split Mode.
  - [ ] Repeat the whole sequence 3×.
- [ ] Read `window.__HELMOR_LONG_FRAMES__.dumpJson()` and the HUD `worst 5s` /
      `long frames` counters.
- [ ] **PASS thresholds:**
  - No frame `> 50ms` recorded during the open/close/expand/restore steps
    (long-frame buffer count `=== 0` for those steps; the divider-drag may
    produce at most 1 frame in the 50-65ms range, acceptable for a
    continuous-resize gesture but MUST NOT exceed 65ms).
  - FPS (HUD top line) stays `>= 55` throughout; never drops below 45.
  - `worst 5s` never exceeds 65ms across the entire sequence.
- [ ] If any threshold fails: capture
      `window.__HELMOR_LONG_FRAMES__.downloadJson()`, open in the perf review,
      and check react-scan for the offending re-render (likely a
      layout/controller component re-rendering chat on every resize tick). File
      a follow-up fix task; do NOT mark this acceptance item done.

---

## Task 8 — No dropped frames switching tabs and during agent control

- [ ] Launch: `VITE_HELMOR_PERF_HUD=1 bun run dev`. Open Split Mode browser.
- [ ] Open 5 tabs to 5 different URLs (e.g. `localhost` dev server + 4 docs pages).
- [ ] `window.__HELMOR_LONG_FRAMES__.clear()`.

### Tab-switch leg
- [ ] Click through all 5 tabs in sequence, then back, twice (20 switches
      total), while a chat response is streaming if possible.
- [ ] **PASS:** long-frame buffer count `=== 0` (`> 50ms`); FPS `>= 55`.
      Switching the active tab only flips `activeTabId` and re-navigates the
      single webview — no per-switch webview creation (cross-check with the
      Task 2 single-live-tab invariant).

### Agent-control leg (Phase 2)
- [ ] Start an agent flow that issues `preview_*` calls (navigate → snapshot →
      click). The "Agent is controlling" banner appears.
- [ ] `window.__HELMOR_LONG_FRAMES__.clear()` once control starts.
- [ ] Let the agent drive 10+ actions while you type in chat.
- [ ] **PASS:** banner render + per-action UI reflection cause no frame `> 50ms`;
      FPS `>= 50`. Snapshot/eval work runs in Rust/host, not the React thread —
      confirm no react-scan "slow render" spikes on the chat tree during
      snapshots.

### Simulator leg (Phase 4)
- [ ] Open a simulator surface, boot a device, let the screenshot poller run.
- [ ] `window.__HELMOR_LONG_FRAMES__.clear()`, observe for 20s with chat visible.
- [ ] **PASS:** with the poller running, FPS `>= 50` and long-frame count from
      poll ticks `=== 0`. Then hide/close the surface and confirm (devtools) the
      poll interval stops (Task 3 guard) — FPS returns to idle `>= 58`.

---

## Task 6 — MEASUREMENT leg: memory is reclaimed on close

Native webview memory is not visible to the JS HUD, so measure at the process
level:

- [ ] `VITE_HELMOR_PERF_HUD=1 bun run dev`. Open Activity Monitor (or
      `ps -o rss= -p <pid>` for the Helmor webview helper process) and note
      baseline RSS with no browser surface open.
- [ ] Open Split Mode browser, load a heavy page, note RSS climbs.
- [ ] Close the surface (close the last tab → Split Mode closes →
      `browserDestroy`). Wait ~10s.
- [ ] **PASS:** the `browser-content` helper webview process is gone (confirm via
      `ps` / Activity Monitor), and main-process RSS returns to within ~15% of
      baseline. Repeat open/close 5× — RSS must not grow monotonically (no leak;
      each cycle returns near baseline).
