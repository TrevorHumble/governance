---
name: build
description: Use when the owner gives a goal with /build, so the run opens with the hard test and then goes through every step.
metadata:
  reads: 'pipeline/PIPELINE.md _claude/skills/working-autonomously/SKILL.md'
---

# Build

`/build <goal>` runs the whole pipeline, even if no command of that name exists. It is never a plain request.

1. Read `pipeline/PIPELINE.md`. Judge the goal against "Before step 1" before anything else. If it is hard, your first message asks the owner to switch with `/model`. Start nothing until they have.
2. Run the twelve steps in order, reading each step's file when you reach it. A small change skips none of them: the worktree, the hand-off and the issue come before any code.
3. Build and file nothing before the owner's yes at step 5.
4. Keep a run note in `.run_state/<N>.md` (the branch name until the issue has a number): the step you are on and the owner's last answer.
5. If the owner is away, read `working-autonomously`. It changes how you handle questions, not the steps. The yes at step 5 still waits for them.
