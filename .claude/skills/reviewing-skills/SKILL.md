---
name: reviewing-skills
description: Use when a pull request adds or changes a skill file or an agent file, to check its job, tools, contract, and description.
metadata:
  reads: 'standards/reviewing.md standards/skills.md'
---

# Reviewing skills and agents

Read `standards/reviewing.md` first, then `standards/skills.md`.

## Checks

1. **One job.** The description states the job and the trigger situation ("Use when..."), in the third person. A description needing "and" for the job means two jobs; name the split.
2. **Agent tools and contract.** Each listed tool serves the job; an agent described as read-only but holding write or shell tools is a `blocker:` naming the tool to drop. The agent file states inputs and outputs.
3. **Only new information.** Cut lines restating model knowledge. Use one term per idea.
4. **Degrees of freedom.** Steps are exact where order matters, and loose where judgment matters. An exact, repeatable step is a script, with error messages naming the fix.
5. **Progressive disclosure.** Long detail lives in files the `SKILL.md` links directly, never in nested links. CI counts size.
6. **Evals.** A new skill with no baseline note (`standards/skills.md`), or untested on each model that runs the skill, gets a `question:`.

## Model walkthrough

Read the skill as the model following the skill, cold, mid-task. Where would the model go wrong, skip a step, or conflict with another rule? Quote the line.
