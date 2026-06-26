---
"helmor": minor
---

Reworked the plan canvas into a freeform, figma-style prototyping surface and hardened plan parsing against leaked tool-call tags.

- `<PlanCanvas>` is now a pan/zoom board of agent-positioned frames that embed live previews, greyscale wireframes, and sticky notes, wired together with labeled flow arrows and grouped into labeled sections. Older `connects=`-only mind-map plans still render via an auto-layout fallback, so nothing breaks.
- Plans that accidentally contain leaked agent tool-call wrapper tags (e.g. a stray trailing `</content></invoke>` from a Write call) no longer collapse to plain text. The parser strips the stray tags before parsing so the canvas and other rich plan components keep rendering.
