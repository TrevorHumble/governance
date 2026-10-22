---
name: github-write
description: Use when you read or write an issue, label, pull request or merge on GitHub, so each call goes through REST the first time.
metadata:
  reads: 'pipeline/steps/06-issue.md pipeline/steps/11-ship.md buildlog/README.md'
---

# Writing to GitHub

Claude Code cloud sessions refuse `gh issue`, `gh pr` and GraphQL with a 403. Do not try them first. Use `gh api repos/{owner}/{repo}/...`, with owner and repo from `git remote get-url origin`. The steps show the porcelain commands; these are the same calls as REST.

- File an issue: `gh api repos/{owner}/{repo}/issues -f title=... -F body=@file -f 'labels[]=needs-issue-review' -f 'labels[]=owner-approved'`, and `-f 'labels[]=hard'` for a hard one. The body's first line is `Owner-approved: yes` (`pipeline/steps/06-issue.md`). Without `needs-issue-review`, CI marks the issue `unverified-issue`. The response holds the number.
- Read an issue: `gh api repos/{owner}/{repo}/issues/<N>`.
- Change part of a body: save the body you just read to a file, change only your lines, then `gh api -X PATCH repos/{owner}/{repo}/issues/<N> -F body=@file`. Never retype a body from memory.
- Add a label: `gh api repos/{owner}/{repo}/issues/<N>/labels -f 'labels[]=hard'`.
- Clear one: `gh api -X DELETE repos/{owner}/{repo}/issues/<N>/labels/needs-issue-review`.
- Open a PR: `gh api repos/{owner}/{repo}/pulls -f head=<branch> -f base=<base> -f title=... -F body=@file`.
- Merge: `gh api -X PUT repos/{owner}/{repo}/pulls/<M>/merge -f merge_method=squash`.
- Close an issue: `gh api -X PATCH repos/{owner}/{repo}/issues/<N> -f state=closed -f state_reason=completed`.

Shipping (`pipeline/steps/11-ship.md`): add the run's buildlog fragment (`buildlog/README.md`) before you push. Then read `repos/{owner}/{repo}/commits/<sha>/check-runs` and merge only once the `build` check run exists on the head SHA and is `completed` with conclusion `success`. An empty list is not green.
