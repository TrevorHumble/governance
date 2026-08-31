# 10: Commit

Confirm isolation is still in effect before the commit, always inside the worktree, never the
primary checkout: `powershell -File tools/assert-worktree.ps1` (a failure means step 01 was never
properly completed; return there before proceeding).

In `shipMode: "pr"`, cut the descriptive branch so the commit lands on it, not the default branch:

```powershell
git switch -c <descriptive-branch-name>
```

In `shipMode: "direct"` there is no branch: commit straight to the default branch.

Before the run's first commit, confirm the hooks are live: `git config core.hooksPath` should
print `.githooks` (if not, run `tools/setup-hooks.ps1` first; never proceed assuming a gate that
is not on).

Commit only once every gating reviewer has passed: `git commit -F data/commitmsg-*.txt` with
`(#N)` in the message, referencing the issue. `commit-msg` blocks a code commit naming no issue
(`(#N)`, a closing keyword, or an `issue-N` branch); a doc-only commit is exempt. `pre-commit`
blocks a commit staging a parent-owned governance path; see `standards/ownership-map.md` for the
wall it enforces. There is no review-evidence file to record; review practice is unmechanized (see
`WHAT-IT-CHECKS.md`).

Committing re-stamps the issue's `active-<N>-*` claim label, per
`standards/issue-standards.md` § "The release rule".
