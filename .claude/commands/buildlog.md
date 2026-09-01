---
description: Fold pending buildlog/*.md fragments into BUILDLOG.md and ship the result as its own PR. Usage: /buildlog
---

Fold every pending fragment in `buildlog/` into the archive, `BUILDLOG.md`, and ship the result.
This is the only thing that writes to `BUILDLOG.md` on a routine ship; see this repo's own
declared Pre-review process file, if one is declared (per `repo-profile.json`'s `preReview`
field), for whether its own approval step writes there directly outside a routine fold, and see
`buildlog/README.md` for what writes there instead of a fragment.

## 1. Refuse if a fold is already in flight

`BUILDLOG.md` is the fold's own write target, so a second fold running concurrently would race
the first one. Before doing anything else, check for an open PR that already touches it, read
from each open PR's own file set rather than a text search (`gh pr list --search` searches PR
text, not file paths, and cannot answer this question):

```powershell
& gh pr list --state open --limit 200 --json number,files `
  --jq '[.[] | select(any(.files[]; .path == "BUILDLOG.md")) | .number]'
```

(`gh` here is the gh CLI at the path declared in `repo-profile.json`'s `ghPath` field, default
`gh` on PATH; a machine where gh lives elsewhere records the absolute path in that machine's own
`CLAUDE.local.md`, never committed.)

`--limit 200` matters here: `gh pr list` defaults to its own 30-PR cap, and a busy repo can easily
carry more than 30 open PRs, which would silently miss an open fold PR past the default window.

If this returns a non-empty array, stop here. Compose nothing, run nothing, report which open
PR(s) already touch `BUILDLOG.md` and that this fold is deferred until they close.

## 2. Create the branch

```powershell
git switch -c buildlog-fold-<date>
```

The branch is cut before anything mutates the working tree, so step 3's fold runs on the fold's
own branch rather than on whatever branch this session happened to be on when it started.

## 3. Fold

```powershell
npm run buildlog
```

This runs `scripts/buildlog-glue.js`, which reads every `buildlog/*.md` fragment except
`README.md`, appends the valid ones to `BUILDLOG.md`, verifies the write, and deletes only the
fragments it confirms landed. Report exactly what it returned:

- What folded (and was deleted).
- What was refused, and under which rule (`shape`, `filename`, `number-mismatch`, `duplicate`,
  `stub`). A refused fragment stays in place: fixing it is not this run's job, but it is not
  nobody's job either. Report the fragment's name and its rule to the session that next runs
  `/build`; that session rewrites the refused fragment in place before its own ship step, so a
  refusal gets an owner instead of sitting silently until someone happens to notice it.
- What verification found missing, if any. A missing fragment also stays in place, and
  `BUILDLOG.md` is restored to its pre-append bytes.
- Any out-of-order warning. The fragment is still folded and deleted; this is informational.

If the run returns a non-zero code, or the `nothing to fold` result, stop here. Commit nothing,
open no PR, and report why (no pending fragments, or every pending fragment was refused/missing).
Since nothing was written before this point (the branch switch in step 2 mutates no files), there
is nothing to undo.

## 4. Ship, only if at least one fragment folded

```powershell
git add BUILDLOG.md buildlog/
git commit -m "buildlog: fold pending fragments into BUILDLOG.md"
git push -u origin buildlog-fold-<date>
& gh pr create --title "buildlog: fold pending fragments" --body-file <body-file>
```

Then re-run the step 1 query, `--limit 200` included:

```powershell
& gh pr list --state open --limit 200 --json number,files `
  --jq '[.[] | select(any(.files[]; .path == "BUILDLOG.md")) | .number]'
```

The check-then-act window between step 1 and this PR's own creation is exactly where a second
fold could have slipped in; re-running now narrows it without pretending to close it (this is a
check-then-act guard, not a lock). If it now returns any PR number other than the one just opened
here:

- Close this PR.
- Restore the fragments this run deleted (they are still in the branch's own history; check out
  their pre-delete state and re-add them to `buildlog/`); nothing was lost, this fold simply
  yields to the one that got there first.
- Report the conflicting PR number and that this fold will re-run once it closes.

Otherwise, watch CI to green and merge, exactly as any other change not gated by a declared
Pre-review step, per `standards/pipeline/steps/11-ship.md`.
