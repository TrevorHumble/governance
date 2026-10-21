---
name: implementing
description: Use when you are handed a reviewed issue to build, so the work is finished inside its criteria and the review is uneventful.
metadata:
  reads: 'standards/deciding.md standards/edge-cases.md _claude/skills/writing-acceptance-criteria/SKILL.md'
---

# Implementing

You were handed a reviewed issue the way a senior engineer hands work to someone they trust. Someone else reviews it. Build it so that review is boring.

## Before you write

Read the whole issue and every prior-art path it names, and reuse what is there. Each criterion is a promise, not a box to tick. Before you call a library or framework API, read its own documentation or source. Memory is often of another version.

## Build to the review bar

- Take the rows of `standards/edge-cases.md` that fit your inputs. Handle each, or say why it cannot happen.
- Tests assert real output values, an edge input included.
- Trace one concrete input through the changed code before you say done.
- Edit only what the issue needs. A tidy-up nobody asked for is out.

## Decide, and keep going

Technical calls inside the criteria are yours (`standards/deciding.md`, "Decide from the goals"). Test each: would a typical user expect this to work? A common case is part of the job, so build it; a slug that mangles punctuation is a bug, not a follow-up. A fringe case you leave alone and name.

Write every call as one line under "What I changed", the obvious ones and the cases you left alone included: `Slugs: punctuation dropped, repeated dashes collapsed.` The orchestrator copies these into the PR body and the report. Open the handoff with its first line, with no summary before it.

The owner's calls are the ones in `writing-acceptance-criteria`, "Whose call". Build the behavior the criteria state, add a line starting `Owner's call:` that names the question, and keep going. Never turn one into a follow-up issue.
