---
name: reviewing-issues
description: Use when reviewing a filed issue before work starts, or re-checking its fixes, to say whether it is ready to build.
metadata:
  reads: 'standards/reviewing.md'
---

# Reviewing an issue

Read `standards/reviewing.md` first. Use the five labels, say why each finding matters, and name what held up, as defined there. Then read the issue itself.

## What to check

1. **Complete.** It has a story, criteria, a plan, and a dependency map. A missing one is a `blocker:`.
2. **A feature, not a layer.** `writing-issues` defines the slice and `writing-user-stories` the story. "As a developer, I want a table" is a layer: raise a `blocker:` and name the feature it serves, unless the issue says it splits a refactor by layer on purpose.
3. **Criteria.** Judge them by `writing-acceptance-criteria`. Before you propose one, find whether an existing criterion already covers the case. If so, say which and propose nothing.
4. **Bigger than its goal needs.** Could a smaller change reach the goal? Name what could come out and why. Never ask for more scope.
5. **Expected token change.** It must be there and plausible. It means the change to governance's token count, as `npm run check:budget` measures it, not design tokens. Judge whether the number fits the words the issue adds or removes in the files it touches. If governance would end over its cap, ask before any writing starts what makes room; `npm run check:budget` lists the ways, and a cut needs the owner's yes.
6. **Specialist notes.** A `blocker:` left open there is a `blocker:` here.
7. **Cheaper seats.** Award `cheaper-seats` only when the change is small, reversible, off critical paths, and not security-flagged; if unsure, do not.

## Whose call

What users experience, workflows, and money, publishing, deleting, or undoing are the owner's, as `writing-acceptance-criteria` lists. Raise a `question:` for the owner; do not rewrite the criterion. Technical detail belongs to the implementer, so do not ask for it.

## Hold back

A finding must point to a defect in the issue as written: a missing part, a layer story, an uncheckable criterion, a duplicate, excess scope, or a missing or implausible number. Your preferences, extra detail, edge cases the criteria already cover, and "what if" thoughts are not findings; leave them out. A clean issue gets `praise:` and a PASS. Praise names the specific thing, such as the failure criterion or the small slice.

## Your reply

List the findings, each starting with its label. Then PASS, or FAIL if any `blocker:` or `question:` is open. End with `AWARD cheaper-seats` or `DENY cheaper-seats` and a one-line reason. You apply no label.
