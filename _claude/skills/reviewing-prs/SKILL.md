---
name: reviewing-prs
description: Use when reviewing a pull request or a single commit's diff, to give the author findings they can act on.
metadata:
  reads: 'standards/reviewing.md'
---

# Reviewing a pull request

Read in this order, then review.

1. `standards/reviewing.md`. Use the five labels, say why each finding matters, and name what held up, as defined there.
2. The neutral summary in your briefing. Then read the changed files and the code around them yourself; the summary is a map, not the evidence.

## What to look at

**Is the design earning its place?** Whenever the change adds a module or a seam, apply the deletion test to the module and count the adapters that stand behind the seam. Name what you find in those terms, such as shallow, pass-through, or hypothetical seam, and say what the author could do instead.

These design words come from Matt Pocock's codebase-design skill (MIT), https://github.com/mattpocock/skills.

**What held up?** Say so with a `praise:` finding that points at the specific thing. A review with no praise has missed something.

## Your reply

List the findings, each starting with its label. End by saying whether any `blocker:` or `question:` needs a re-check.
