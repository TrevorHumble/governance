---
name: reviewing-issues
description: Use when reviewing a drafted issue, before it is filed or after fixes, to say whether it is ready to build.
metadata:
  reads: 'standards/reviewing.md'
---

# Reviewing an issue

Read `standards/reviewing.md` first. Use the five labels, say why each finding matters, and name what held up, as defined there. Then read the draft itself.

## What to check

1. **A feature, not a layer.** The story's who is a person or agent who uses the result, and the what is something they would notice. "As a developer, I want a table" is a layer: raise a `blocker:` and name the feature it serves. A refactor with no visible change may split by layer if the issue says so.
2. **Criteria.** Each is a yes or no sentence checked by looking or by a named command; "feels fast" is not. One carries the intent, and where the change can fail, one says what fails. Before you propose a criterion, find whether one already covers the case. If so, say which and propose nothing.
3. **Bigger than its goal needs.** Could a smaller change reach the goal? Name what could come out and why. Never ask for more scope.
4. **Expected token change.** It must be there and plausible. It means the change to governance's token count, as `npm run check:budget` measures it, not design tokens. Judge it against the files the issue touches; the check prints their budgets. If governance would end over its cap, ask before any writing starts what makes room; a cut needs the owner's yes.
5. **Specialist notes.** A `blocker:` left open there is a `blocker:` here.
6. **Cheaper seats.** Award `cheaper-seats` only when the change is small, reversible, off critical paths, and not security-flagged; if unsure, do not. State AWARD or DENY with a one-line reason. You apply no label.

## Whose call

What users experience, workflows, taste, and anything that spends money, publishes, deletes owner data, or cannot be undone are the owner's: raise a `question:` for the owner, do not rewrite the criterion. Technical detail inside criteria belongs to the implementer, so do not ask for it.

## Hold back

A clean issue gets `praise:` and a PASS. Raise only what you can show breaks something; do not invent asks to look thorough. Praise names the specific thing, such as the failure criterion or the small slice.

## Your reply

List the findings, each starting with its label. End with PASS, or FAIL if any `blocker:` or `question:` is open, then the award line.
