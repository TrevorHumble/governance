---
name: reviewing-prs
description: Use when reviewing a pull request or a single commit's diff against its issue, to say whether the change keeps the issue's promises.
metadata:
  reads: 'standards/reviewing.md standards/edge-cases.md standards/deciding.md definition-of-done.md NORTH-STAR.md'
---

# Reviewing a pull request

Read `standards/reviewing.md` first, then the acceptance criteria, the briefing's neutral summary, and the changed files with the surrounding code.

## Three lists

Write one line for each acceptance criterion, each numbered clause of `definition-of-done.md`, and each goal under "Goals" in `NORTH-STAR.md`: `yes` with evidence (a file and line, a test that would fail without the change, or a command's output, including the briefing's test output), `no` with the failure, or `n/a` with the reason. A clause checked only after review, such as CI or the PR body at step 11, is `n/a` naming that step. A `no` is a `blocker:`. A missing file gets one line stating the absence. An item is a `no` in three ways:

- **Unmet.** No code does the work, or the test passes either way.
- **Met in wording only.** The label or message exists but the behavior behind the label is missing, such as a "Last synced" line showing the current time.
- **No failure case.** The criterion names a failure, such as a file that cannot be saved, and no code or test handles the failure.

A claim in the PR description, such as "also fixes #52", needs evidence in the diff; without evidence, ask a `question:`.

## Edge cases

Find the rows of `standards/edge-cases.md` that fit the change's inputs, and check each row was tested. An untested row is a `minor:` naming the row; do not restate the table.

## Specialist blockers

Read the specialists' blockers and re-checks in the briefing to avoid duplicate findings. Do not redo the design, security or repo lens reviews.

## Issue notes

Rule on each note under the issue's `## Notes` from the criteria and `NORTH-STAR.md`. An implementation note, or a note the builder settled, is a `blocker:` naming the note and any settling line. A note over the limits in `standards/deciding.md`, "Stay in scope", or an owner call (`writing-acceptance-criteria`, "Whose call"), is a `blocker:` until the record shows the owner was asked, and, if the answer could change this diff, until the record has the answer. Give each passing note a ruling line. The same limits judge a fix the PR body names outside the issue's files.

## Findings

A finding is a `no` line, an untested row that applies, a ruling on an issue note, a line anywhere the change made untrue (a tooltip, a doc, a comment, a rule), an owner call you are fairly sure is wrong (a `blocker:` naming the call and the reason, so the run asks the owner), a defect in the changed lines shown with an input and a wrong result, or a wrong `Security review:` line by the briefing's checks (a missed check: `blocker:`; a `ran` line naming no changed, fitting line: `nitpick:`). So is the lesson from the review steps. Preferences are not findings.

## Failure search

Trace the changed code by hand with real inputs, including inputs no edge-case row names. Find the failures the tests missed.

## Reply format

Give the three lists before the findings.
