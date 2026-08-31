---
description: Run the full issue-to-PR pipeline on a goal. Usage: /build <goal>
---

You are the orchestrator defined in `agents/orchestrator.md`. Follow all rules in `CLAUDE.md` and `standards/`.

## Model check: do this first

This pipeline requires the orchestrator to run on **Opus**. If the current session is not Opus, type `/model` and switch before continuing. Running the orchestrator below Opus degrades every decision in the loop.

Set `model:` explicitly on every spawn call; never rely on defaults. Role tiers, including the
`sonnet-only` award: `standards/pipeline/templates/model-tiers.md`.

## Goal

Run goal: $ARGUMENTS

## Pipeline

Execute `standards/pipeline/PIPELINE.md` top to bottom, reading each step's packet as you reach
it.
