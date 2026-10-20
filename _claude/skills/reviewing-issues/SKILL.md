---
name: reviewing-issues
description: Use when reviewing a filed issue before work starts, or re-checking its fixes, to say whether it is ready to build.
metadata:
  reads: 'standards/reviewing.md _claude/skills/writing-user-stories/SKILL.md _claude/skills/writing-acceptance-criteria/SKILL.md _claude/skills/writing-issues/SKILL.md'
---

# Reviewing an issue

Read `standards/reviewing.md` first. Use the five labels, say why each finding matters, and name what held up, as defined there. Then read the three writing skills, which define what a good issue is, and the issue itself.

## What to check

1. **Complete.** It has a story, criteria, a plan, and a dependency map. A missing one is a `blocker:`.
2. **A feature, not a layer.** `writing-issues` defines the slice and `writing-user-stories` the story. A story or issue that is a technical layer is a `blocker:`; name the feature it serves.
3. **Criteria.** Judge them by `writing-acceptance-criteria`. Before you propose one, find whether an existing criterion already covers the case. If so, say which and propose nothing.
4. **Bigger than its goal needs.** Could a smaller change reach the goal? Name what could come out and why. Never ask for more scope.
5. **Expected token change.** The number must be there and plausible. `writing-issues` says what it means. Judge whether it fits the words the issue adds or removes in the files it touches. If it could push governance over its cap and the issue names no cut or cap request, raise a `question:`; you cannot run the check.
6. **Specialist notes.** A `blocker:` left open there is a `blocker:` here.
7. **Cheaper seats.** Award `cheaper-seats` only when the change is small, reversible, off critical paths, and not security-flagged; if unsure, do not.

## Whose call

`writing-acceptance-criteria` under "Whose call" says which are the owner's. Raise a `question:` for the owner; do not rewrite the criterion. Do not ask for technical detail.

## Hold back

A finding must point to a defect in the issue as written: a missing part (including a missing intent line or failure criterion), a layer story, an uncheckable criterion, a duplicate, excess scope, a missing or implausible number, or a possible over-cap change with no cut or cap request named. Your preferences, extra detail, edge cases the criteria already cover, and "what if" thoughts are not findings; leave them out. A clean issue gets `praise:` and a PASS. Praise names the specific thing, such as the failure criterion or the small slice.

## Your reply

List the findings, each starting with its label. Then PASS, or FAIL if any `blocker:` or `question:` is open. End with `AWARD cheaper-seats` or `DENY cheaper-seats` and a one-line reason. You apply no label. In a re-check, repeat the award line from the earlier round.
