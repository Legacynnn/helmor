---
"helmor": minor
---

Split the workspace center column into a multi-pane conversation canvas.

- Drag a conversation onto another's edge to split the center column into side-by-side or stacked panes (up to 4), resize the splits, and rearrange or close panes; the layout persists per workspace and survives navigating away and back. ⌘W closes the focused pane.
- Agents sent from a split now know about their sibling panes: the Helmor system prompt lists the other open sessions and the `helmor` CLI commands to inspect, read, or hand them work, so panes can coordinate across the canvas. Single-pane sends are byte-for-byte unchanged.
