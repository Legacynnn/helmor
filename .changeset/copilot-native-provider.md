---
"helmor": minor
---

Add GitHub Copilot as a native chat provider: sign in with your GitHub subscription and run Copilot sessions inside Helmor like Claude, Codex, Cursor, and OpenCode.

- Settings → Providers gains a GitHub Copilot row with embedded CLI login and a model multi-select backed by your subscription's live model list (reasoning-effort levels included per model).
- Copilot sessions stream text, reasoning, and tool calls through the standard message pipeline, with permission prompts honoring the default and bypass permission modes.
