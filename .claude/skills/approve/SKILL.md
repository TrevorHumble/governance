---
name: approve
description: Use when the owner types /approve, to show which waiting issues it approved.
---

# Approve

The owner's typed /approve fires `.claude/hooks/approve.ps1`, which has already tagged every waiting issue. You only report.

1. If `.claude/settings.json` does not name `approve.ps1`, this repo has no approval gate yet. Say so in one line. The owner's /approve is the go-ahead: the run goes on to step 07 without the label.
2. Otherwise read `.run_state/approved-last.json` under the project root. Show one line per issue: `owner/name#N` and its title. List any with `ok` false as not approved, and say a second /approve retries them.
3. If the file is missing or empty, say nothing was waiting.

Never add the `owner-approved` label yourself.
