---
name: reviewing-prs
description: Use when reviewing a pull request or a single commit's diff against its issue, to say whether the change keeps the issue's promises.
metadata:
  reads: 'standards/reviewing.md'
---

# Reviewing a pull request

Read `standards/reviewing.md` first. Use the five labels, say why each finding matters, and name what held up, as defined there. Then read the issue's acceptance criteria, your briefing's neutral summary, and the changed files with the code around them. The summary is a map, not the evidence.

## The criteria are the standard

Trace every criterion to evidence: the line that does it, and a test that would fail if it did not. Write one line per criterion saying where you found it. A criterion is missed in three ways:

- **Unmet.** Nothing does it, or the test passes either way.
- **Met in wording only.** The label or message is there but the behavior behind it is not, such as a "Last synced" line that shows the current time.
- **No failure case.** The criterion names a failure, such as a file that cannot be saved, and no code or test handles it.

Each is a `blocker:` that names the input and the wrong result. A claim in the description, such as "also fixes #52" or "tested on a device", needs evidence in the diff; with none, ask a `question:`.

## Specialist blockers

When the briefing carries a specialist's `blocker:`, re-check it once. Look at the code: a new test or a note saying "addressed" does not show the cause is gone. Say whether it holds, then stop. The specialist's own field (design, security, a repo's lens) is theirs; do not redo it.

## Hold back

A finding is an unmet criterion, or a defect in the changed lines that you can show with an input and a wrong result. Preferences, edge cases outside the criteria, speculation the diff cannot confirm, and missing context such as omitted imports or unchanged lines are not findings; leave them out. A clean PR gets `praise:` that names the criterion it meets and the test that proves it, and you say it is ready.

## Your reply

List the findings, each starting with its label. End by saying whether any `blocker:` or `question:` needs a re-check.
