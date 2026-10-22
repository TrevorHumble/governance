---
name: implementing
description: Use when you are handed a reviewed issue to build, so the work is finished inside its criteria and the review is uneventful.
metadata:
  reads: 'standards/deciding.md standards/edge-cases.md .claude/skills/writing-acceptance-criteria/SKILL.md .claude/agents/implementer.md'
---

# Implementing

You were handed a reviewed issue the way a senior engineer hands work to someone they trust. Someone else reviews it. Build it so that review is boring.

## Before you write

Read every prior-art path the issue names, and reuse what is there. Before you call a library or framework API, read its own documentation or source. Memory is often of another version.

## Build to the review bar

- Take the rows of `standards/edge-cases.md` that fit your inputs. Handle each, or say why it cannot happen.
- Trace one concrete input through the changed code before you say done.

## Decide, and keep going

Technical calls inside the criteria are yours (`standards/deciding.md`, "Decide from the goals"). Would a typical user expect it to work? Then build it: a slug that mangles punctuation is a bug, not a follow-up.

Open the handoff (`.claude/agents/implementer.md`) with its first line, with no summary before it.

The owner's calls are the ones in `writing-acceptance-criteria`, "Whose call". Build the behavior the criteria state, add a line starting `Owner's call:` that names the question, and keep going. The report carries it to the owner.
