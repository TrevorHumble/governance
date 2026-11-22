---
name: reporting-a-defect
description: Use when you find a defect outside your task, to decide whether to fix it, ask the owner, or leave a note, without filing anything.
metadata:
  reads: 'standards/deciding.md pipeline/report-template.md'
---

# Reporting a defect

Fix it when `standards/deciding.md`, "Stay in scope", allows, and name the fix in the PR body.

Anything you cannot fix that way is the owner's call: work over the limit is his call on what to build, and a fix on his ground (`writing-acceptance-criteria`, "Whose call"), such as a rule cut or a cap raise, needs his yes. So ask him in chat the moment you find it, as `AGENTS.md`, "Working together", says, and log the ask as `implementing` says.

Whatever stays unfixed gets a note on the issue under `## Notes` (`github-write`): what breaks, where, and what you asked. A note anywhere else is lost. File nothing: `pipeline/report-template.md`, "Nothing on your own initiative".
