---
name: realign
description: Use between waves, or on /realign with the next batch's issue numbers, to resync the default branch and check the batch for overlap with what just merged.
metadata:
  reads: 'tools/check-freshness.ps1'
---

# Realign

`/realign <issues>` makes the tree current and tells the owner whether the next batch still fits it. It launches nothing.

1. `git fetch origin`. Read `git status --porcelain` and how far the default branch is ahead of or behind origin.
2. Read each issue's `Touches` (`github-write`). Before any resync, run `tools/check-freshness.ps1 -Touches "<every Touches of the batch, comma-separated>"`. It names each `OVERLAP` file. Find the merge with `git log origin/<default> -- <file>`.
3. Clean and only behind: `git merge --ff-only` to origin's default branch. Dirty, or ahead of origin: change nothing. No rebase, stash or reset; say what you found.
4. Report each issue as clear, or as overlapping on a file and the merge that touched it.
