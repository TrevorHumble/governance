---
name: build
description: Use when the owner gives a goal with /build, so the run opens with the hard test and then goes through every step.
metadata:
  reads: 'pipeline/PIPELINE.md .claude/skills/working-autonomously/SKILL.md'
---

# Build

`/build <goal>` runs the whole pipeline, even if no command of that name exists. It is never a plain request.

1. Read `pipeline/PIPELINE.md`. Judge the goal against "Before step 1" before anything else. If it is hard, note it; "Before step 1" says what that moves. Then run step 01 (`tools/start-run.ps1`) right away.
2. A small change skips no step, except a configuration change, which takes the configuration lane in `pipeline/PIPELINE.md`. The worktree, the hand-off and the issue come before any code.
3. Build nothing before the owner's approve at step 6. After it, run to the merged PR, asking only as `AGENTS.md`, "Working together", says.
4. Keep the run note `.run_state/<N>.md` that step 01 writes at the project root: the step you are on, the owner's last answer, and, under its `## Decisions` heading, the decision lines (`implementing` says which). Step 11 copies that section into the PR.
5. If the owner is away, read `working-autonomously`. It changes how you handle questions, not the steps. The approve at step 6 still waits for them.
