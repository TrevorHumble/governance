# Dependabot PR path

Full mechanics for `agents/orchestrator.md` § "Dependabot PR path". Read the stub there first for
the trigger; this file is the one link deeper it points to.

Classify command:

```powershell
powershell -File tools/classify-dep-pr.ps1 -Ecosystem <ecosystem> -DepName <name> -SemverBump <patch|minor|major> -DepType <prod|dev>
```

- Output `auto` → merge when CI is green; no tracked decision needed.
- Output `review` → do not merge during this run. Carry the decision rationale as a report note,
  per `agents/orchestrator.md` § "No agent files its own issue", rather than opening a GitHub issue
  on this agent's own initiative. Hold the PR unmerged; merge only after the owner decides off that
  report.

The authoritative tier logic lives in `tools/classify-dep-pr-core.ps1` (invoked via `tools/classify-dep-pr.ps1`); `.claude/rules/dependencies.md` owns the policy summary and the critical dependency list.
