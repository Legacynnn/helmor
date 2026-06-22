---
"helmor": minor
---

Visual plans get live UI previews, a richer canvas, and a far more resilient renderer.

- Prototype variants can now render live, interactive React + Tailwind previews — large and frame-filling — alongside low-fidelity wireframes.
- A single malformed component no longer blanks the whole plan: the broken block is isolated as an inline notice and everything else renders normally.
- Wireframes gain `grid`/`section`/`spacer` primitives, denser card layouts, and smooth entrance + variant-switch animations.
- The plan canvas shows per-role badges and icons, stays acyclic (no cluttered last-to-first loops), and the Plan tab now leads with the plan's title.
- The conversation shows a richer "plan ready" card with title and status, and the pinned top plan strip is gone.
