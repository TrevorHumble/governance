# 03: Research

Delegate the whole research step to `agents/researcher.md`, tier per
`standards/pipeline/templates/model-tiers.md`. It checks local prior art first: the codebase
itself, `standards/`, `agents/`, `.claude/skills/`, `.agents/skills/` (if this repo has one),
`docs/`, and `DESIGN.md`. For a question about this project's own stack or dependencies, it
consults the installed package docs and the existing tests in `tests/` next. Web search is a last
resort, used only when local and domain references are clearly insufficient. Do not research what
prior art already answers.

**After the findings doc comes back, act on it.** Do not build anything the findings show already
exists and is adaptable. If the findings doc's "Existing owner of a named rule" section surfaces an
existing owner, hand that owner (the `file:line`) to the implementer before implementation starts:
the change must extend or call that owner, not duplicate it. If the researcher found nothing
adaptable, proceed with authoring per `standards/agent-standards.md` (agents) or
`standards/skill-standards.md` (skills).

Rare case: an autonomous timed run's Done-Early Cascade makes deep web research a default activity
rather than a last resort. See `agents/orchestrator/autonomous-timed-run.md`.
