---
"helmor": minor
---

Make terminal agents first-class: persist and replay their output, render them faithfully, fill the panel width, and reliably end the process on close.

- Terminal session scrollback is now saved to disk and replayed when a session is reopened, so sessions survive app restarts instead of showing a black screen; reopened sessions show their history with a Relaunch action rather than auto-spawning.
- Fixed mangled TUI spacing (e.g. Claude Code's box-drawing) by decoding PTY output across read boundaries instead of per-chunk, and enabled truecolor.
- Reconnected/relaunched CLIs no longer render a duplicated UI and now use the full width of the terminal panel.
- Closing a terminal agent reliably terminates its process, including when closed during the brief spawn window.
