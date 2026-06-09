---
"helmor": minor
---

Add the Vesper theme — a translucent, macOS-only dark theme backed by native window blur.

- The sidebars, titlebar, terminal, main content, and editor are translucent over a native macOS NSVisualEffectView blur (no CSS backdrop-filter), with the editor and terminal matching the main content's translucency.
- Entering fullscreen swaps to an opaque dark background to avoid the green NSVisualEffectView cast, then restores the blur on exit.
