---
"helmor": minor
---

Improved the inspector's All Files tree.

- It now lists git-ignored files and folders, dimmed to distinguish them from tracked entries. Ignored directories (like `node_modules/`) list as a single entry and expand their contents on demand when opened, instead of showing an empty folder.
- A new icon toggle in the Files tab header shows or hides git-ignored entries, and the choice is remembered.
- Folder icons in the All Files and Git trees are now desaturated and darkened to a consistent near-black set (legible in dark themes too), instead of a mix of per-name colored (and blue-tinted) Material icons. File icons stay colorful.
