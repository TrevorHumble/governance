---
name: reviewing-issues
description: Use when reviewing a filed issue before work starts, or re-checking its fixes, to say whether it is ready to build.
metadata:
  reads: 'standards/reviewing.md .claude/skills/writing-user-stories/SKILL.md .claude/skills/writing-acceptance-criteria/SKILL.md .claude/skills/writing-issues/SKILL.md pipeline/PIPELINE.md'
---

# Reviewing an issue

Read `standards/reviewing.md` first, then the three writing skills, which define a good issue.

## Checks

1. **Complete.** The story, criteria, plan and dependency map are present. A missing part, intent line or failure criterion, a fenced diff, or a duplicate of an open issue is a `blocker:`.
2. **Feature, not layer.** `writing-issues` defines the slice, and `writing-user-stories` the story. A story or issue that is a technical layer is a `blocker:`; name the feature the layer serves.
3. **Criteria.** Judge by `writing-acceptance-criteria`. Before proposing a criterion, check whether an existing criterion covers the case. If so, name the existing criterion and propose nothing.
4. **Scope.** Could a smaller change reach the goal? Name each removable part and the reason. Never ask for more scope. A `Found:` criterion is the owner's to strike, not excess.
5. **Expected token change.** In the governance home, the number is present and plausible; a child issue without a number passes. `writing-issues` defines the number. Judge the number against the words the issue adds or removes. If the change could push governance over the cap and the issue names no cut or cap request, raise a `question:`; you cannot run the check.
6. **Specialist notes.** An open `blocker:` in the specialist notes is an issue `blocker:`.
7. **Hard.** Award `hard` when the plan meets the hard test in `pipeline/PIPELINE.md`, the issue lacks the label, and the `Hard:` line is not `Hard: no (owner)`.

## Owner calls

`writing-acceptance-criteria` under "Whose call" lists the owner calls. Raise a `question:` for the owner instead of rewriting the criterion. Do not ask for technical detail.

## Plan walkthrough

Open every file the plan names, and the surrounding code. Follow each step as the builder would. Where would the builder get lost, guess, or break code the plan never mentions? Cite `file:line`. Could Haiku build the change from the plan alone? A plan missing any of the four parts in `writing-issues`, or a step no builder could follow, is a `blocker:`.

## Reply format

After the findings, PASS, or FAIL if any `blocker:` or `question:` is open, then the re-check line from `standards/reviewing.md`. End with `AWARD hard` or `DENY hard` and a one-line reason, as the last line. You apply no label. In a re-check, repeat the earlier round's award line.
