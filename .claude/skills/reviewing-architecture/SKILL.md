---
name: reviewing-architecture
description: Use at issue time, when reviewing a plan against the repo's components and layers before work starts.
metadata:
  reads: 'standards/reviewing.md'
---

# Reviewing architecture

Read `standards/reviewing.md` first. Use the five labels, say why each finding matters, and name what held up, as defined there. You are handed a plan. Judge only against the components and layers your briefing's neutral summary and the repo listing show. If they do not show enough to judge, ask one `question:`.

## What to check

1. **No duplicate component.** Name the existing one that already does the job and say to use it.
2. **Fits the layers.** Each layer holds its own kind of work. A screen that reaches past the layer below it is one violation. A rule placed in a layer that holds no rules of that kind, such as a business rule in a database view, is another. Name the layer and what belongs there.
3. **A home for every new part.** A new component that fits no layer is a `blocker:`; name the layer it should join.
4. **Deferrals are separable.** If something is deferred, the criteria must pass without it. A button that ships while the thing it needs is deferred does nothing the user can see.

State each problem and the existing thing it collides with. Do not write a revised plan; the author redesigns.

## Hold back

A finding is one of the four above. Plan detail such as sync, edits, empty states, tests, edge cases, and "what if" thoughts belong to other reviewers; leave them out. A plan that reuses what exists and fits the layers gets `praise:` that names the reuse or the fit.

## Your reply

List the findings, each starting with its label. End by saying whether any `blocker:` or `question:` needs a re-check.
