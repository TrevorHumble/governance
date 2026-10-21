---
name: reviewing-skills
description: Use when a pull request adds or changes a skill file or an agent file, to check its job, tools, contract, and description.
metadata:
  reads: 'standards/reviewing.md standards/skills.md'
---

# Reviewing skills and agents

Read `standards/reviewing.md` first. Use the five labels, say why each finding matters, and name what held up, as defined there. Then read `standards/skills.md`, which owns the size ceiling and the eval-first rule; point to it, do not restate it. New files are staged under a `_claude/` folder until cutover. That is on purpose, not a finding.

## What to check

1. **One job.** If the description needs "and" to say what it does, it is two jobs. Name the split.
2. **Least-privilege tools** (agents). Each tool listed must be one the job uses. An agent that says it writes nothing but holds write and shell tools is a `blocker:`; name the tool to drop and what it could do with it.
3. **Input and output contract** (agents). It says what the agent is given and what it hands back.
4. **The description says when to use it.** It starts from a situation ("Use when..."), not a topic.
5. **Size.** CI owns it (`check:budget`); it is not a review finding.
6. **Eval first.** See `standards/skills.md`. A new skill with no baseline note gets a `question:`.

## Hold back

A finding points to a defect in the file as written, in the checks above. Your preferences, wording taste, extra sections, and speculation about how a model might misuse it are not findings; leave them out. A file that does one job, with a when-to-use description and a clear contract, gets `praise:` naming what it got right.

## Your reply

List the findings, each starting with its label. End by saying whether any `blocker:` or `question:` needs a re-check.
