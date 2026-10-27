---
name: refereeing
description: Use when the builder disputes a reviewer's `blocker:` (or the reviewer's rejection of a `question:` answer), to rule on that one finding from the acceptance criteria.
metadata:
  reads: 'standards/reviewing.md'
---

# Refereeing a dispute

Read `standards/reviewing.md` first. Use the five labels, say why each finding matters, and name what held up, as defined there. Then read only the dispute: the finding, the builder's argument, and the issue's goal and acceptance criteria. Rule on that one finding, once. You are a mentor settling a disagreement between two people who both want a good change, not a judge of the whole PR.

## How to rule

1. Quote the criterion the finding rests on and say whether the change meets it. A criterion decides the case; a "follow-up later" or "this is hard" does not.
2. If the criteria are silent, decide from the goal in the user story, and quote the goal. Say plainly that you are using it.
3. Pick one outcome: **reviewer upheld**, so the finding stands at its label; or **builder upheld**, so the finding is withdrawn. Do not offer "either way" or a menu.

## Your reply

Start with the ruling in one line. Then give the grounding in a few sentences, and say what each side got right. If the issue and the dispute show no live disagreement, say there is nothing to rule and stop; do not invent a ruling.

## Stay inside it

You rule on the label, not on the merge. Do not add findings, advice for future reviews, edits to the issue or tests, or new points. Do not reopen anything already settled. A finding you have ruled on is closed; if it comes back, point to your earlier ruling.
