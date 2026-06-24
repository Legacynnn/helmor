---
name: thermo-nuclear-code-quality-review
description: Extremely strict maintainability and abstraction audit of a change or codebase. Use when the user wants a thorough, no-mercy code-quality review — spaghetti detection, the 1000-line rule, leaky abstractions, and "code-judo" restructurings. Helmor-vendored Claude Code variant.
---

# Thermo-Nuclear Code Quality Review (Claude Code)

A maximally strict review of maintainability and abstraction quality. This is
not a bug hunt — it is an audit of whether the code will stay comprehensible and
changeable six months from now. Be demanding. Praise nothing reflexively.

## When to use

- The user asks for a deep / strict / "thermo-nuclear" quality review.
- Before merging a large or architecturally significant change.
- When a module "smells" but nobody can say exactly why.

## Process (Claude Code)

Run the review as parallel subagents, then synthesize. Use the `Task` tool to
dispatch the review dimensions concurrently — each subagent gets the same diff or
file set but a single lens, so findings stay focused and independent:

1. **Scope the target.** Identify the diff (`git diff <base>...`) or the file
   set under review. State the scope explicitly before reviewing.
2. **Fan out one subagent per lens** (dispatch in a single message so they run
   concurrently):
   - **Abstraction & boundaries** — are the right seams drawn? Leaky
     abstractions, god objects, anemic wrappers, premature generality.
   - **Complexity & length** — the 1000-line rule (no file should need to be
     that long to do its job), deep nesting, long functions, cyclomatic load.
   - **Spaghetti & coupling** — hidden control flow, action-at-a-distance,
     circular deps, shared mutable state.
   - **Naming & cohesion** — do names tell the truth? Does each unit do one
     thing? Dead code, duplicated logic.
   - **Code-judo restructurings** — for each major smell, propose the smallest
     restructuring that flips the code from rigid to flexible.
3. **Synthesize.** Merge the subagent findings, dedupe, and rank by severity
   (P0 blocker → P3 nit). For each finding give: location, why it hurts
   maintainability, and a concrete fix.
4. **Verdict.** End with a one-line ship/no-ship call and the top 3 things to
   fix first.

## Rules

- Severity over volume. A ranked list of real problems beats a wall of nits.
- Every finding must name a file/symbol and a concrete remedy.
- Prefer the smallest restructuring that removes the smell ("code-judo"): use
  the code's own structure against its rigidity rather than rewriting wholesale.
- Do not invent requirements. Review what the code is trying to do, not what you
  wish it did.
