# PIPELINE

## Before step 1: is it hard?

Judge the goal first. It is hard if it is novel and deep (hard math or algorithms, no prior art to reuse), or something we can't get back (a loss outside git: user data, someone else's work, money, something public). Deleting what git holds is not that. It is also hard if the owner says so.

If it is hard, your first message asks the owner to switch the session to the `hard` award's orchestrator model and effort in `seats.json`, with `/model`.

Mid-run, it is hard when the same finding fails review three times, or the implementer hands back unfinished work other than a stop to ask the owner or before a risky step. Then commit the attempt to the branch as a wip commit naming the issue, and revert it in a second commit, so the attempt stays in history and the tree is back where step 08 began. Add the `hard` label (`gh issue edit <N> --add-label hard`), a pipeline call. Restart step 08 from the issue, starting every agent from the award from then on. Earlier review findings and decision lines do not carry over; deferred notes do. Your own seat stays, and nothing goes back to the owner.

## The steps

Run these twelve steps in order. Each line says what the step is for and what it hands on. The step file says how. Read a step's file when you reach it, not before.

1. **Isolate** (`pipeline/steps/01-isolate.md`). Work in your own worktree, cut from the current default branch, never the shared checkout. Hands on: a clean, current tree.
2. **Sync** (`pipeline/steps/02-sync.md`). Pull the parent governance's updates, which land on a later run. Hands on: the rules in the tree.
3. **Research** (`pipeline/steps/03-research.md`). Look at what this repo already has first, and the web last. Hands on: what you found and where.
4. **Pre-review** (`pipeline/steps/04-pre-review.md`). A repo with a pre-review surface settles it with the owner first. Others skip to step 5. Hands on: the owner's settled answer, or nothing.
5. **Hand-off** (`pipeline/steps/05-hand-off.md`). One short message to the owner: title, story, criteria, whether it is hard, token change, any proposed cut. Hands on: the owner's yes.
6. **Issue** (`pipeline/steps/06-issue.md`). File what the owner approved. This step may call the architecture specialist first. Hands on: an issue number.
7. **Issue review** (`pipeline/steps/07-issue-review.md`). A fresh reviewer reads the issue. Hands on: a passing issue.
8. **Implement** (`pipeline/steps/08-implement.md`). The implementer builds what the issue asks. You do not. Hands on: the change.
9. **PR review** (`pipeline/steps/09-pr-review.md`). Review, fix, and re-check until it passes. Hands on: a passing change.
10. **Commit** (`pipeline/steps/10-commit.md`). Commit the change, naming the issue. Hands on: a commit.
11. **Ship** (`pipeline/steps/11-ship.md`). Open the PR and merge it on green. Hands on: a merged change.
12. **Report** (`pipeline/steps/12-report.md`). Tell the owner what happened and what needs them, using `pipeline/report-template.md`. Hands on: the report.

## The configuration lane

Configuration is not a build. Tuning your own setup does not change the product, so the full build is for work that does.

A model swap, which only changes provider, model, or effort values in `seats.json`, runs steps 1, 10, 11, and 12, with no issue and no review. Cite the standing "Seat changes" issue, #111, in the commit.

An edit that only touches a skill the owner starts (the `notCounted` folders in `governance-manifest.json`) runs the same steps plus one `reviewing-skills` pass, and its commit cites no issue. Fix the pass's findings and merge, with no re-check round, even for a `blocker:`. That is an exception to `standards/reviewing.md` § "Re-check rounds".

`npm run check:seats` decides whether a PR qualifies, against the PR base, and names the path that keeps it out. A PR with anything else runs all twelve steps.

Show the owner the check's output, and merge on green only after the owner says yes in chat.

## Reviewers

How reviewers work, and what a re-check covers: `standards/reviewing.md` § "Independence" and § "Re-check rounds".

## When you are unsure

Before you ask the owner anything, follow `standards/deciding.md`.
