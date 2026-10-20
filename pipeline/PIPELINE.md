# PIPELINE

Run these twelve steps in order. Each line says what the step is for and what it hands on. The step file says how. Read a step's file when you reach it, not before.

1. **Isolate** (`pipeline/steps/01-isolate.md`). Work in your own worktree, never the shared checkout. Hands on: a clean tree.
2. **Sync** (`pipeline/steps/02-sync.md`). Catch up with the default branch and the parent governance. Hands on: the current rules.
3. **Research** (`pipeline/steps/03-research.md`). Look at what this repo already has first, and the web last. Hands on: what you found and where.
4. **Pre-review** (`pipeline/steps/04-pre-review.md`). A repo with a pre-review surface settles it with the owner first. Others skip to step 5.
5. **Hand-off** (`pipeline/steps/05-hand-off.md`). One short message to the owner: title, story, criteria, token change. Hands on: the owner's yes.
6. **Issue** (`pipeline/steps/06-issue.md`). File what the owner approved. Hands on: an issue number.
7. **Issue review** (`pipeline/steps/07-issue-review.md`). A fresh reviewer reads the issue. Hands on: a passing issue.
8. **Implement** (`pipeline/steps/08-implement.md`). The implementer builds what the issue asks. You do not. Hands on: the change.
9. **PR review** (`pipeline/steps/09-pr-review.md`). Review, fix, and re-check until it passes. Hands on: a passing PR.
10. **Commit** (`pipeline/steps/10-commit.md`). Commit the change, naming the issue.
11. **Ship** (`pipeline/steps/11-ship.md`). Open the PR and merge it on green.
12. **Report** (`pipeline/steps/12-report.md`). Tell the owner what happened and what needs them, using `pipeline/report-template.md`.

## The seats-only lane

A model-swap PR, one that only changes a model or an effort in `seats.json`, needs no issue and no review rounds. It runs steps 1, 10, 11, and 12 and skips the rest.

`npm run check:seats` decides whether a PR qualifies, against the PR base. Only `seats.json` (plus `buildlog/` and `BUILDLOG.md`) may change, and only the `provider`, `model`, and `effort` values within it. Anything else runs all twelve steps.

The check prints a before and after table. Show it to the owner and merge on green only after the owner says yes in chat. Cite the standing "Seat changes" issue, #111, in the commit.

## Reviewers

How reviewers work, and what a re-check covers: `standards/reviewing.md` § "Independence" and § "Re-check rounds".

## When you are unsure

Before you ask the owner anything, follow `standards/deciding.md`.
