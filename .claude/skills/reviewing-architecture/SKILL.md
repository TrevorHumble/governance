---
name: reviewing-architecture
description: Use when reviewing a plan at hand-off, or the built code at PR review, against the repo's components, layers and recorded decisions.
metadata:
  reads: 'standards/reviewing.md DESIGN.md repo-profile.json'
---

# Reviewing architecture

Read `standards/reviewing.md` first. You get the plan at hand-off and the built code at PR review. Read `DESIGN.md`, and any archive `DESIGN.md` links to when the change touches older decisions. Undoing a recorded decision is a finding.

## Checks

1. **No duplicate component.** Name the existing component that does the job, and ask for reuse.
2. **Layer fit.** Each layer holds one kind of work. A screen that reaches past the layer below is one violation; a rule in a layer with no rules of that kind, such as a business rule in a database view, is another. Name the layer and the work the layer holds.
3. **Placement.** A new component that fits no layer is a `blocker:`; name the right layer.
4. **Big files.** At hand-off, open each file the plan grows and judge from the plan whether the file passes `fileSize.limit` in `repo-profile.json`. At PR review, the briefing lists each grown file past the limit. For each file, propose a split, or the reason the file is one job; the author records the reason in `fileSize.allowed`.
5. **Guarded decisions.** A `DESIGN.md` decision a check could guard, with no guarding check, is a `nitpick:` naming the check.
6. **Separable deferrals.** The criteria pass without the deferred work. A button that ships while the backing work is deferred does nothing visible to the user.

Name each problem and the existing component the problem collides with. Do not write a revised plan; the author redesigns.

## Long-term fit

Picture the design six months on. What does the design couple that should be separate? What becomes hard to change? What would a strong architect do? Checks catch broken rules; you judge conceptual integrity, and whether each part sits at the right level of abstraction. Design and security have dedicated reviewers.
