---
name: github-write
description: >-
  How to create/update GitHub issues and commit changes in this project using git
  and the GitHub CLI (ship flow: branch, then pull request, then merge on green
  CI; see standards/pipeline/steps/11-ship.md). Triggers: "create an issue",
  "commit this", "push to GitHub", "open a PR", "close the issue", any task that
  writes to git or GitHub for this project.
---

# github-write

## Critical: gh path

Resolve the gh CLI path from `repo-profile.json`'s `ghPath` field (default `gh`, meaning on
PATH). A machine where `gh` lives elsewhere records its absolute path as a per-machine note in
that repo's own `CLAUDE.local.md`, never in the committed profile.

```powershell
& "<resolved ghPath>" <subcommand>
```

The remote is whatever `git remote -v` reports for this checkout. `gh` commands default to it, so you rarely need `--repo`.

## GitHub is the single source of truth, keep issues in sync

Every issue file `data/wip-issues/<N>-slug.md` has a matching GitHub issue, and **the GitHub issue owns the
status** (open/closed/labels). The file is the detail; the board is the state. The pipeline keeps them
equal, see `CLAUDE.md` § "Repo conventions". The sync rule:

- **On issue creation** → the owner hand-off message defined in `standards/issue-standards.md` §
  "Owner hand-off" is sent and approved **before** `gh issue create` runs; an agent following this
  recipe cannot file an issue around the hand-off. Then run `gh issue create`, plain title (no
  locally-minted number prefix; GitHub assigns the number, per `standards/issue-standards.md` §
  "Naming"), with `--label needs-issue-review` applied at creation time alongside the tier label:
  `ready` / `backlog` / `low priority`. Capture the number GitHub assigns before writing the local
  draft file, since that number is the draft's identity. The issue body can summarize and link the
  file. Record the approval in both the GitHub issue body and the draft as required by
  `standards/issue-standards.md` § "Owner hand-off".
- **On merge to the default branch** → close the matching card; the ship step's packet,
  `standards/pipeline/steps/11-ship.md`, carries the close command.
- **On graduation/supersession** → update the card (re-label, or close with a pointer to the successor).
- Never leave the board disagreeing with the issue files / BUILDLOG (the folded archive plus any
  pending fragment in `buildlog/`); the orchestrator's own close-out step keeps them in sync as
  part of merging a PR, and there is no separate reviewer gate for board drift.

```powershell
& "<resolved ghPath>" issue create `
  --title "Short title" `
  --label "ready" `
  --label "needs-issue-review" `
  --body @'
Tracks data/wip-issues/<N>-slug.md (canonical detail in the repo, written after this command
returns the assigned number).

## Summary
...
'@
```

## Committing

```powershell
git add <specific files>   # never git add -A blindly
git commit -m @'
Short imperative summary

Co-Authored-By: <committing model> <noreply@anthropic.com>
'@
```

Run `git status` before staging to avoid committing `.env` or large binaries.

## Opening a PR

See `standards/pipeline/steps/11-ship.md`.

## Conventions

- No FINAL / LAST / TRULY_FINAL in branch names or commit messages.
- Prefer specific file staging over `git add .`.
- PowerShell line continuation: backtick `` ` ``, not `\`.
