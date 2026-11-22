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
- Search the repo for the words that described the old behavior, and fix each one your change made untrue.

## Decide, and keep going

Technical calls inside the criteria are yours (`standards/deciding.md`, "Decide from the goals"). Would a typical user expect it to work? Then build it: a slug that mangles punctuation is a bug, not a follow-up.

Ask the owner as `AGENTS.md`, "Working together", says: in chat, the moment you find it. Log an ask whose answer could change this change as `- Asked: <question>` under `## Decisions` in the run note, add `Answer: <his words>` to that line when he replies, and keep building what does not wait on it; ship stops while one has no answer. Log any other ask, dated, in the issue's note, with his answer when it comes; the merge does not wait for it. Before a trade-off reaches him, look for the design that keeps both. A call near his ground that you make with some doubt gets a `- Call: <what and why>` line, which the report repeats; every other decision is a plain line.

## Write it down

Review and commit come after the build, not inside it. Before you call the build done, write these down, so shipping can copy them as written:

- Under `## Decisions` in your run note (`.run_state/<N>.md`): what I changed, then one line under it for each decision you made inside the criteria and each case inside the issue you left alone, every `Asked:` and `Call:` line included.
- On the issue, under `## Notes`, as `reporting-a-defect` says, or "none".

A technical call you doubt is yours to settle. Make it and say why in the PR body.
