# 01: Isolate

Run every step inside your own linked git worktree, never the shared primary checkout. Two
sessions sharing one working directory can stash, revert, or switch branches under each other's
uncommitted work (wedding-scavenger-hunt repo, issue #113).

Check isolation first: `powershell -File tools/assert-worktree.ps1`. If it exits non-zero, you are
in the shared primary checkout: create and enter a worktree with `powershell -File
tools/new-agent-worktree.ps1 -Branch <session-branch>`, then run every remaining step from inside
it. If it exits `0`, you are already isolated: continue in place.

This applies to every session, whether invoked through `/build` or directly; there is no opt-in
exemption for a directly-invoked session.

**Fresh base, not just isolation.** `tools/new-agent-worktree.ps1` fetches the remote default
branch (`repo-profile.json`'s `defaultBranch` field) first and cuts the new branch from it, never
from local HEAD, so the worktree starts 0 commits behind regardless of how stale the primary
checkout's local default branch is (wedding-scavenger-hunt repo, issue #357: a worktree cut from a
76-commits-stale local main produced a review certified against an already-abandoned base).

**Check freshness unconditionally.** Whether you just cut the worktree or were already inside one,
run `powershell -File tools/check-freshness.ps1` against this worktree before continuing to the
sync step. Expect `0 commits behind` the remote default branch for a freshly-cut one. This bypasses
the primary checkout's own behind-count entirely: a stale primary checkout never aborts the build,
since the worktree was cut straight from the remote default branch. If the check instead reports
drift (its output names the count with the literal phrase `commits behind`), resync per its
instructions before continuing.
