# Governance Sync Standard

**Scope:** every repo that declares a `governanceHome` in its own `repo-profile.json` (a
"child"). This standard rides `standards/**` into every child on sync, so it is the single synced
document that names the adoption fields and the merge rule; do not restate its wording elsewhere.

---

## What a sync is

A pull, not a push: at build start, a child runs `tools/governance-sync.ps1` against the
governance home (its declared `governanceHome`). The tool clones the governance home, diffs
its declared `sharedPaths` against the child's own tree, classifies every planned path as content
or structure against the shipped `governance-manifest.json`'s `classes`, `classesDefault`, and
`arrivesAsStructure` fields (`standards/ownership-map.md` § "Change classes" is the rule's prose
source; `tools/governance-sync-core.ps1`'s `Get-SyncClassification` is the one code home of the
rules those sidecars can derive. One rule in that same prose source is not: an edit to the map's
own "Parent-owned paths inside split-ownership directories" list is structural too, but no sidecar
encodes it, so the checker cannot see it and returns content for it), and, when anything
content-classed remains, opens (or refreshes) a small pull request in the child carrying exactly
that diff. A path no `classes` entry names is judged by the manifest's own `classesDefault` field:
structure, the safe side, unless that field names the literal string `content` (a manifest
declaring no `classesDefault` field at all is also structure). A content-classed sync PR merges
itself on green CI, with no reviewer, human or agent; § "Merge-on-green" below is the mechanism
and its precondition.

A structure change is withheld from the PR, never merged silently. A run that still ships
something after withholding prints the marker `structure change: partial withhold` and opens the
PR carrying only what was not withheld. A run where the whole plan classifies as structure (the
parent's manifest differs from the child's installed copy at all, a shipped file's text cites a
withheld path, or nothing is left to ship after withholding) prints `structure change: no sync PR`
and opens no PR at all: no PR to merge, so no reviewer question ever arises for it either. Either
way the withheld paths are named in the child's standing structure issue (§ "The standing-issue
rule" below) instead, for a human to sequence by hand.

## Adoption fields

A child turns the sync on by declaring two fields in its own `repo-profile.json`:

- `governanceHome` (string): `self` for the governance home, or the URL or filesystem path of
  the governance home repo for a child. Absent means unconfigured: the tool does nothing.
- `syncIssue` (positive integer): the child's own standing GitHub issue number for governance
  syncs. Required whenever `governanceHome` is not `self`.

A child whose default branch is not `main` must also declare `defaultBranch` in its own
`repo-profile.json` (the profile reader's fallback is `main`): the sync tool cuts its worktree
and branch from `origin/<defaultBranch>`, so a child on a different default branch left
undeclared would have the sync target the wrong ref.

A child also declares, optionally:

- `ciCheckNames` (array of strings): the check names required on its default branch. This is the
  same field `tools/apply-branch-protection.ps1` writes into branch protection; § "Merge-on-green"
  below is what reads it back.
- `acknowledgedDivergentPaths` (array of strings): the retained-divergent paths (§ "The
  retained-divergent rule" below) this child means to keep on purpose. Absent or empty means none
  acknowledged. Each entry must be written repo-relative, forward-slashed, and exact-case, the
  same form `Plan.RetainedDivergent` itself uses: matching is ordinal (case-sensitive,
  separator-sensitive), so `Standards/foo.md` or `standards\foo.md` will not acknowledge
  `standards/foo.md` and that path keeps warning, keeps opening the issue, and keeps appearing in
  the PR body as unacknowledged.

This standard is the synced document that names these fields, since `DESIGN.md`'s
`repo-profile.json` schema section never reaches a child (`DESIGN.md` is not itself synced).

## Merge-on-green

A content-classed sync PR arms itself for auto-merge (`gh pr merge --auto`) the moment it is
opened or refreshed, provided a precondition holds: every check name the child declares in
`ciCheckNames` must actually be required on its default branch (read back from GitHub's branch
protection, the same required-checks list `tools/apply-branch-protection.ps1` writes). An
unreadable or absent protection object, an empty required-check list, and an empty declared
`ciCheckNames` each count as absent, so none of the three ever arms; a declared check name GitHub
does not actually require also withholds arming. Confirming this precondition is what makes
"green" mean something: auto-merge on a branch with no required check merges immediately, CI or
no CI, so the tool never arms a PR it cannot first confirm a real gate protects. It cannot confirm
one thing beyond that. No CI job that mechanically guards a child's parent-owned paths against
local edits (the wall's counterpart to `standards/ownership-map.md`) is defined, named, or
specified anywhere in this tree today. `.githooks/pre-commit` does that guarding locally (it
dot-sources `tools/ownership-core.ps1` and blocks a staged edit to a path the child does not own),
but it is a local hook, not a CI check: it runs on the machine making the commit, GitHub never
runs it, and it cannot appear in `ciCheckNames`, which only names checks GitHub itself reports as
required. A child that adds a CI-side version of this guard is responsible for naming it, and for
also listing that name in its own declared `ciCheckNames`, so this gate actually requires it
before arming; until a child does both, this tool has nothing to confirm on that front and cannot
close the gap for itself.

Arming is entirely non-fatal: a failure at any step (the precondition above, a superseded-PR
sweep failure per § "Superseded syncs" below, or the merge call itself) is a warning on stderr,
never a failure of the run. A PR that could not be armed stays open for hand-merge; the run that
tried still succeeded at its actual job, computing the plan and shipping the PR.

The triggering build does not wait for the merge. It continues on the tree it already has; the
merged governance, once GitHub actually merges the PR, arrives at the next build, consistent with
pull-on-build. Passing `-NoAutoMerge` to `tools/governance-sync.ps1` suppresses the arming call
only; the superseded-PR sweep and every other step of the run stay unchanged.

## The standing-issue rule

Every child that declares a non-`self` `governanceHome` also declares `syncIssue`, its own
standing GitHub issue tracking governance syncs. Every sync commit the tool makes references
that issue number (`(#<N>)` in the commit message), satisfying the child's own
`.githooks/commit-msg` gate, which blocks a code commit naming no issue.

**The standing structure issue.** A separate standing issue tracks a structure verdict: at most
one per child, titled exactly `governance sync: structure change pending adoption`, found by an
exact title match (never `gh issue list --search`, whose index lags issue creation and would let a
freshly-created issue go unfound). Its body names the parent sha, the classification's run reason,
and every withheld path. A run that finds this issue already open refreshes its body in place
rather than opening a second one; both a run that ships a PR with nothing withheld, and a run whose
plan is empty (nothing left to sync at all, most often because a human already adopted the
structure change by hand since the last run), close it instead, so a child that has adopted the
change does not keep a false open row. On the empty-plan path this close is best-effort only: `gh`
being unresolvable or unreachable there is a warning, never a failure of the run (the governance
repo's DESIGN.md § "Governance sync", "The empty-plan close is best-effort, never load-bearing").
This issue takes no commit reference and is not `syncIssue`: `syncIssue` stays the commit-reference
target every ordinary sync commit names, and a structure-only run commits nothing, so it never
touches `syncIssue` at all.

Every sync commit also passes the child's own `.githooks/pre-commit` ownership wall (see
`standards/ownership-map.md`) when a PowerShell launcher is on the child's `PATH`, and only
because the branch the tool builds (`issue-<N>-governance-sync-<shortsha>`, § "Superseded syncs"
above) is exactly the shape `Test-IsSyncBranch` in `tools/governance-sync-core.ps1` exempts, even
though the commit stages paths the wall would otherwise block. A change to that branch-naming
scheme has to keep matching what the wall's exemption recognizes, or every child's sync commits
start failing closed. In a child with neither `powershell` nor `pwsh` on `PATH`, the wall blocks
the sync commit before it ever reaches the branch check: the launcher probe runs first and fails
closed on its own, so the branch exemption is never consulted.

## Superseded syncs

A sync branch is named for the parent commit it carries (`issue-<N>-governance-sync-<shortsha>`).
When the parent has moved since a still-open sync PR was opened, the next sync run opens a PR
under a new branch name for the new commit; this is not a collision, it supersedes the older
one. `tools/governance-sync.ps1` closes every other open PR whose head branch
`Test-IsSyncBranch` recognizes, unmerged, and deletes its branch, before arming this run's own
PR: a whole-file snapshot carries one parent commit, so an older armed PR going green after a
newer one merged would write the older snapshot back over the newer. This sweep runs on the ship
path and the empty-plan exit, on every real run including `-NoAutoMerge`, but never on the
no-sync-PR (structure) exit: an older sync PR there still carries content this child has not
received, and closing it would strand that content until a human adopts the withheld structure
change. A sweep failure withholds this run's own PR from arming too (warn, leave every sync PR
open for hand-merge): a surviving older armed PR is the one failure arming would make worse.

## The retained-divergent rule

A retired path (one the governance home used to declare shared but no longer does) is pruned from
a child automatically only when the child's copy still matches the last-shipped content
byte-for-byte (its recorded `sha256`). When the child's copy has diverged, the sync PR body lists
it as retained-divergent instead of deleting it, and, when it is not (yet) declared under the
child's own `acknowledgedDivergentPaths`, the tool also prints a standing `WARNING retained
divergent: <path>` line on every build (even a build with nothing else to sync) and files it in a
second standing issue, titled exactly `governance sync: retained divergent paths pending
disposition`, found and refreshed the same exact-title way as the standing structure issue above.
Filing or closing this issue is best-effort at every exit the tool reaches: a `gh` failure there
is a warning, never a failure of the run.

A path stops appearing in the warning line and the issue the moment it is declared under
`acknowledgedDivergentPaths` in the child's own `repo-profile.json`; the issue closes instead of
refreshing once every retained-divergent path for that child is either acknowledged or gone
(deleted, or no longer retired). There are exactly two ways to end a retained-divergent path's
standing: declare it under `acknowledgedDivergentPaths`, accepting that the child intends to keep
content the governance home no longer maintains, or delete the file, accepting the retirement. A
child that finds itself needing to keep diverged _content_ the governance home still actively
maintains, rather than a retired path, has no such choice: the ownership wall
(`standards/ownership-map.md`) forbids editing a parent-owned file's local copy at all, so the one
path left is changing the rule in the governance home itself, the same repo every other governance
fix is made in.

## After merge

Once a sync PR merges, the merged governance is not necessarily in any worktree yet: merge-on-green
means the merge can land after the triggering build already finished (§ "Merge-on-green" above).
The next build to run `tools/governance-sync.ps1` against that child sees an in-sync tree (or the
next pending diff, if the parent moved on again) and proceeds normally; nothing in this pipeline
waits for or re-cuts a worktree mid-build on account of a sync merge.

## What the tool mechanizes and what it cannot force

`tools/governance-sync.ps1` mechanizes the diff, the classification, the PR, and the merge: it
computes the plan, classifies every planned path as content or structure, opens (or refreshes) the
sync PR when anything content-classed remains, arms that PR for auto-merge once the CI-guard
precondition holds, sweeps every superseded sync PR first, opens (or refreshes, or closes) the
standing structure issue and the retained-divergent-paths issue as the plan and classification
call for, and prunes a retired path only when the child's copy still matches the last-shipped
hash. It cannot force a child to run it at all, force GitHub to actually merge an armed PR, force
a human to act on an open standing issue, or verify that a child's own CI guard job is among its
declared `ciCheckNames`: none of that is detectable from the governance home. A child may keep its
own `WHAT-IT-CHECKS.md` describing that child's own CI and coverage; the governance home's own
`governance-manifest.json` never lists it in `sharedPaths`, so this tool neither creates nor
maintains one, and it carries no promise about what any given child's build actually checks.
