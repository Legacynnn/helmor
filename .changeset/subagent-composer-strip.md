---
"helmor": minor
---

Added a running-subagent strip above the composer.

- While a session's spawned subagents (Claude `Task`/`Agent` or Codex `subagent_*`) are running, a strip slides in flush on top of the composer with one chip per live subagent — each with a distinct pixel-art sprite, identity color, and name — and slides out when they finish.
- Clicking a chip filters the conversation to just that subagent's output. A banner at the top of the thread names the subagent and shows its activity (type, tool uses, files touched, steps, and running/done state) with a "Show all" control to clear the filter.
