# AGENTS.md

`CLAUDE.md` is the single authoritative operating contract for every agent working in
this repo: Claude, Gemini, Antigravity, or any other tool that reads this file by
convention. Read it before doing anything, and follow it exactly.

Everything an agent needs lives there or in the files it points to:

- Operating rules and the pipeline: `CLAUDE.md`.
- Model-tier equivalents, including Gemini / Antigravity:
  `standards/pipeline/templates/model-tiers.md`.
- Checkable standards (issues, reviews, agents, skills, docs): `standards/`.
- Agent definitions: `agents/` (its `agents/orchestrator/` subfolder holds the orchestrator's
  load-conditional procedure files, not agent charters; charter requirements do not apply to them).
- Path-scoped operating rules live in `.claude/rules/` and load automatically for the files they
  govern; which rules exist is per-repo. This is a Claude Code auto-load mechanism, so a
  non-Claude tool must read those files explicitly.

This file is deliberately a pointer, not a copy: duplicating `CLAUDE.md` here would let the
two drift. There is one operating contract, and it is `CLAUDE.md`.
