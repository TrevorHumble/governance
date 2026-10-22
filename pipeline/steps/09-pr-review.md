# 09-pr-review

Review, fix, re-review until it passes. That loop is normal and fair; most changes take a round or two.

## Who looks

Seat every reviewer as `_claude/agents/orchestrator.md` says. Run each specialist once, on the working-tree diff (no PR exists until step 11):

- `reviewing-design`: every diff.
- `reviewing-security`: when the diff touches anything its description names, or any path in `criticalPaths` or any entry in `criticalDependencies` (`repo-profile.json`).
- `reviewing-skills`: when a skill or agent file changes.
- `reviewing-docs`: when docs change.
- Every skill named in `lenses` (`repo-profile.json`).

A specialist does not loop. Have the implementer fix what they raise.

## The PR reviewer

Then start one fresh PR reviewer with `reviewing-prs`. Hand it the issue and a neutral summary, not your reasoning: `standards/reviewing.md` § "Independence". Put the specialists' blockers in its briefing; it re-checks each by looking at the code.

Put the run's deferred notes in the briefing too, and ask for one ruling line per note: could it have been fixed in this run, yes or no, and why. Step 12 reads those lines.

On a FAIL, fix every `blocker:` and answer every `question:`, then re-check as `standards/reviewing.md` § "Re-check rounds" says. A finding the implementer contests goes to `refereeing`, once.

## Evidence before a PASS

Put `Reviewed tree: <id>` in each briefing, the id from `npm run check:evidence -- --tree`; the reviewer repeats it on its reply's first line. Save the reply under `.review_state/` and accept a PASS only if `npm run check:evidence -- <file>` passes. It fails when the code changed after the review or a cited `file:line` does not exist: fix that, then review again.

## Token change

If the measured token change differs materially from the one stated at hand-off, ask the owner again: `pipeline/steps/05-hand-off.md`.
