---
"helmor": minor
---

Repository settings now have a "Workspace files" section that copies git-ignored essentials (like `.env` files, keys, and local config) into every new workspace. Secret-like untracked files are auto-detected and copied by default — each can be excluded individually — and you can add any other file or folder by relative path. Files are copied into a new workspace before its setup script runs, and existing files are never overwritten.
