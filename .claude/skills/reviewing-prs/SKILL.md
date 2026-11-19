---
name: reviewing-prs
description: Use when reviewing a pull request or a single commit's diff against its issue, to say whether the change keeps the issue's promises.
metadata:
  reads: 'standards/reviewing.md standards/edge-cases.md standards/deciding.md definition-of-done.md NORTH-STAR.md'
---

# Reviewing a pull request

Read `standards/reviewing.md` first. Use the five labels, say why each finding matters, and name what held up, as defined there. Then read the issue's acceptance criteria, your briefing's neutral summary, and the changed files with the code around them. The summary is a map, not the evidence.

## Three lists

Write one line for each acceptance criterion, each numbered clause of `definition-of-done.md`, and each goal under "Goals" in `NORTH-STAR.md`: `yes` with its evidence (a file and line, a test that would fail without it, or a command's output, the briefing's test output included), `no` with what fails, or `n/a` with why. A clause checked only after review, such as CI or the PR body at step 11, is `n/a` naming that step. A `no` is a `blocker:`. A missing file gets one line saying so. An item is a `no` in three ways:

- **Unmet.** Nothing does it, or the test passes either way.
- **Met in wording only.** The label or message is there but the behavior behind it is not, such as a "Last synced" line that shows the current time.
- **No failure case.** The criterion names a failure, such as a file that cannot be saved, and no code or test handles it.

A claim in the description, such as "also fixes #52" or "tested on a device", needs evidence in the diff; with none, ask a `question:`.

## Edge cases

Find the rows of `standards/edge-cases.md` that fit the change's inputs and check that each was tested. An untested row is a `minor:` that names the row; do not restate the table.

## Specialist blockers

When the briefing carries a specialist's `blocker:`, re-check it as `standards/reviewing.md` says. Look at the code: a new test or a note saying "addressed" does not show the cause is gone. Design, security, and a repo's own lens are the specialists' fields; do not redo them.

## Notes on the issue

Rule on each note under the issue's `## Notes` from the criteria and `NORTH-STAR.md`. A note on how something is built, or one they settle, is a `blocker:` naming the note and any settling line, unless you estimate the fix is over the limits in `standards/deciding.md`, "Stay in scope". A note that is the owner's call (`writing-acceptance-criteria`, "Whose call") is a `blocker:` until the briefing's `Asked:` lines show his `Answer:`. Give one ruling line for each answered or over the limits. The same limits judge a fix the PR body names outside the issue's files.

## Hold back

A finding is a `no` line, an untested row that applies, a ruling on an issue note, a line anywhere that the change made untrue (a tooltip, a doc, a comment, a rule), one of the owner's calls you are fairly sure is wrong (a `blocker:` naming it and why, so the run asks him), or a defect in the changed lines you can show with an input and a wrong result. Preferences, edge cases no row names, speculation the diff cannot confirm, and missing context are not findings. A clean PR gets `praise:` naming the criterion it meets and its evidence, and you say it is ready.

## Your reply

Give the three lists, then the findings, each starting with its label. End by saying whether any `blocker:` or `question:` needs a re-check.
