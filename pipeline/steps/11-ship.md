# 11-ship

From the worktree, run `tools/ship.ps1 -Issue <N> -Title "<title>" -Entry "<detail>"`. `-Entry` is the buildlog detail after the summary: what shipped, why, what review found (`buildlog/README.md`). It opens the PR with your decision lines, adds the buildlog fragment, merges on green, and closes the issue. If it stops, fix what it names and run it again; it never merges red. The configuration lane runs `tools/ship.ps1 -Lane -Body "<check:seats output>"`, adding `-Issue 111` for a model swap; it stops at green. After the owner's yes in chat, `tools/ship.ps1 -Lane -Merge` merges.

If `shipMode` in `repo-profile.json` is `direct`, there is no PR: push the default branch and watch CI there.
