---
description: Re-orient after compaction or a break. Usage: /resume
---

Re-read these files in order, they carry the context you need:

1. `CLAUDE.md`: this repo's operating contract (behavioral rules, model policy, pipeline). Read
   this first.
2. `agents/orchestrator.md`: the pipeline, model policy, and ship flow for this repo.
3. Where the work stands: `gh issue list` / `gh pr list` for live backlog priority, and, for the newest state, the five most recent pending files in `buildlog/` (excluding `README.md`), ordered by the date on each entry line rather than filename: each one a ship not yet folded into the archive. Note the total pending count alongside them; a count above five means older pending ships exist beyond what was read (`agents/orchestrator.md` § "Wave boundary" is what is supposed to keep that count small; if it is not, that is itself worth flagging). Fall back to the newest entry in `BUILDLOG.md` on the default branch only when no fragment is pending.
4. This repo's own goals doc, if any (see `repo-profile.json`'s `goalsDoc` field): the goals every change must serve.

Optionally, if you have access to the user's global `~/.claude/CLAUDE.md`, read it afterward for personal working-style preferences. It is secondary to the repo's own `CLAUDE.md` and not required for safe operation in this repo.

Then confirm the local hooks are armed:

```powershell
git config --get core.hooksPath
```

This should print `.githooks`. If it does not, run `powershell -ExecutionPolicy Bypass -File tools/setup-hooks.ps1`.

Report back:

- Current branch, and the five most recent pending files in `buildlog/` (excluding `README.md`, ordered by entry date) plus the total pending count, or, if none are pending, the last entry in `BUILDLOG.md` on the default branch.
- Where the work stands (one sentence, from the issue board and the pending `buildlog/` fragments, or, absent those, the newest `BUILDLOG.md` entry).
- Whether `core.hooksPath` is armed.
- The next item in the priority backlog (from `gh issue list`).
