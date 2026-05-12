---
"helmor": minor
---

Quick-open and workspace-wide search land together:

- `Cmd+P` opens a fuzzy file picker (recents shown when empty); `Cmd+Shift+P` opens a stub command palette.
- `Cmd+Shift+F` toggles a left-sidebar content-search panel — grouped results, jump-to-line, smart-case matching, gitignore-aware.
- `Cmd+P` and `Cmd+Shift+F` now share one walker that respects `.gitignore` (still skips `.git/`, `node_modules`, and build output). `Cmd+Shift+P` was previously bound to "Create PR"; that action moves to `Cmd+Alt+P` and is rebindable.
