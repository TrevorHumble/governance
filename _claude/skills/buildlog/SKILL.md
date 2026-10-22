---
name: buildlog
description: Use on /buildlog, or when pending fragments in buildlog/ should be folded into BUILDLOG.md, so the fold ships as its own pull request.
metadata:
  reads: 'buildlog/README.md BUILDLOG.md'
---

# Buildlog

`/buildlog` folds the pending fragments in `buildlog/` into `BUILDLOG.md`. It writes no new entry; a fragment is written when its issue ships (`buildlog/README.md`).

1. Look for an open PR touching `BUILDLOG.md` (`github-write`: `pulls`, then `pulls/<n>/files`). If one is open, stop and name it. Two folds race.
2. Cut a branch from the default branch and run `npm run buildlog`. The script writes `BUILDLOG.md`; do not edit it by hand.
3. Report each fragment it refused, by name and rule. If nothing folded, make no commit and no PR.
4. Commit `buildlog/` and `BUILDLOG.md` only, and open the PR.
5. Check again for another PR touching `BUILDLOG.md`, then merge on green (`github-write`).
