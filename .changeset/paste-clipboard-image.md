---
"helmor": patch
---

Pasting an image that lives only on the clipboard (e.g. "Copy Image" from a browser or a Cmd+Ctrl+Shift+4 screenshot) now adds it to the composer as an attachment. Previously such pastes were silently dropped because the webview only exposes pasted files, not clipboard-resident image data.
