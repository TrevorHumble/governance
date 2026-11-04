---
name: implementing
description: Use when you are handed a reviewed issue to build, so the work is finished inside its criteria and the review is uneventful.
metadata:
  reads: 'standards/deciding.md standards/edge-cases.md .claude/skills/writing-acceptance-criteria/SKILL.md'
---

# Implementing

You have a reviewed issue, and the build is yours. A fresh reviewer reads it later. Build it so that review is boring.

## Before you write

Read every prior-art path the issue names, and reuse what is there. Before you call a library or framework API, read its own documentation or source. Memory is often of another version.

## Build to the review bar

- Take the rows of `standards/edge-cases.md` that fit your inputs. Handle each, or say why it cannot happen.
- Trace one concrete input through the changed code before you say done.

## Decide, and keep going

Technical calls inside the criteria are yours (`standards/deciding.md`, "Decide from the goals"). Would a typical user expect it to work? Then build it: a slug that mangles punctuation is a bug, not a follow-up.

The owner's calls are the ones in `writing-acceptance-criteria`, "Whose call". Build the behavior the criteria state, add a line starting `Owner's call:` that names the question, and keep going. The report carries only these to the owner.

## Write it down

Review and commit come after the build, not inside it. Before you call the build done, write these down, so shipping can copy them as written:

- In your run note (`.run_state/<N>.md`): what I changed, then one line under it for each decision you made inside the criteria and each case inside the issue you left alone, every `Owner's call:` line included.
- On the issue, under `## Notes` (`reporting-a-defect`): what you left unfixed outside the criteria, and why, or "none".

A call you doubt is yours to settle. Make it and say why in the PR body.
