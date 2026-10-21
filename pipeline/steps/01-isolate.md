# 01-isolate

Work in your own worktree, never the shared checkout. Two sessions in one folder can stash, revert, or switch branches under each other's unsaved work.

Run `tools/assert-worktree.ps1`. If it exits non-zero, you are in the shared checkout. Make a worktree with `tools/new-agent-worktree.ps1 -Branch <name>` and do every later step inside it. A new branch is cut from the remote default branch.

Then run `tools/check-freshness.ps1`, whether you just cut the worktree or were already in one. If it reports `commits behind`, catch up as it says before step 02.
