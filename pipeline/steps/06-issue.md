# 06-issue

The owner's /approve has run. The `approve` skill shows each issue it tagged. If yours is among them, run to the merged PR with no check-ins, except an owner call a later step names.

If yours is missing or marked not approved, it stays in `waiting.json`. Say so in one line and wait for the next /approve. The issue reviewer at step 07 does not start on an issue without `owner-approved` (`spawn-check`, `WHAT-IT-CHECKS.md`).

In a repo whose `.claude/settings.json` does not wire `approve.ps1`, there is no gate yet: the skill says so, and you carry on to step 07.
