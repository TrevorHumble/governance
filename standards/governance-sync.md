# Governance Sync Standard

**Scope:** every repo that declares a `governanceHome` in its own `repo-profile.json` (a
"child"), and the reviewers of the repo where a sync PR arrives (a sync PR never arrives at the
governance home itself). This standard rides
`standards/**` into every child on sync, so it is the single synced document that names the
adoption fields and the operative merge rule; do not restate its wording elsewhere.

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
declaring no `classesDefault` field at all is also structure). Nothing merges automatically: the
PR sits until a contradiction review disposes of it, per this standard.

A structure change is withheld from the PR, never merged silently. A run that still ships
something after withholding prints the marker `structure change: partial withhold` and opens the
PR carrying only what was not withheld. A run where the whole plan classifies as structure (the
parent's manifest differs from the child's installed copy at all, a shipped file's text cites a
withheld path, or nothing is left to ship after withholding) prints `structure change: no sync PR`
and opens no PR at all. Either way the withheld paths are named in the child's standing structure
issue (§ "The standing-issue rule" below) instead, for a human to sequence by hand.

## The contradiction review

A governance-sync PR gets exactly one question, asked once, not the full round-1 reviewer
gate: **does the new global content contradict a rule the receiving repo's tracked override home
declares** (the child's own `CLAUDE.md`, under the literal heading `## Governance overrides`)?
Three outcomes:

- **No contradiction:** merge.
- **One clear fix:** fix and merge.
- **Multiple ways to fix:** stop and ask the owner.

This is the entire review a sync PR needs. `standards/adversarial-review-protocol.md`'s
reviewer-count and review-size rules do not apply to it (see "Reconciliation with the review
protocol" below).

## The override rule

A child overrides a global rule only by declaring it in its own tracked override home: a
line under `## Governance overrides` in the child's own `CLAUDE.md`, naming the rule being
overridden and the reason. The global copy of that rule is never edited in a child. This home
is a **tracked** file, present in every worktree; the gitignored, per-machine
`CLAUDE.local.md` cannot serve this purpose, since a fresh worktree does not contain it and
the contradiction review (which runs inside a fresh worktree, at build time) could never see
a declaration living there.

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

This standard is the synced document that names these fields, since `DESIGN.md`'s
`repo-profile.json` schema section never reaches a child (`DESIGN.md` is not itself synced).

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
one. The reviewer closes the older, now-superseded sync PR unmerged when disposing of the new
one, and deletes the superseded sync branch along with it.

## The retained-divergent rule

A retired path (one the governance home used to declare shared but no longer does) is pruned from a
child automatically only when the child's copy still matches the last-shipped content
byte-for-byte (its recorded `sha256`). When the child's copy has diverged, the sync PR body
lists it as retained-divergent instead of deleting it: the contradiction review disposes of
each retained-divergent entry by hand, either deleting the file (accepting the retirement) or
keeping it by declaring it under `## Governance overrides` (accepting that the child intends
to keep content the governance home no longer maintains).

## The declined-sync rule

Closing a sync PR unmerged pauses the decision, deliberately: the mechanism supports no
permanent silent divergence of a shared file. The next build re-offers the same diff (or its
current equivalent, if the parent has moved on). The two permanent resolutions are: take the
sync and declare a local override under `## Governance overrides`, or change the global rule
in the home repo first, so the next sync carries the fix instead of the contradiction.

## The no-PR divergence disposition

A `WARNING retained divergent: <path>` line can appear on its own, with nothing else to sync
(the tool still prints it every run, even when the plan is otherwise empty, so a
divergence-only child is surfaced on every build). This has no PR to carry a decision, so the
orchestrator disposes of it by hand, the same two ways as § "The retained-divergent rule"
above: deleting the file ends the warning next run, and keeping it under
`## Governance overrides` leaves it standing by design.

A structure verdict is a second, distinct no-PR outcome, disposed of differently: no PR opens, and
the tool prints the literal marker `structure change: no sync PR` naming the run reason, with every
withheld path carried by the standing structure issue (§ "The standing-issue rule" above), not by a
sync PR body or a bare warning line. `.claude/commands/build.md` step 0b's structure branch reports
that issue in the session and continues the build on the governance already in the tree.

## Reconciliation with the review protocol

The escalation outcome above ("multiple ways to fix: stop and ask the owner") is cross-repo
legislation: an upstream owner control, the same class as issue-speccing, not an adversarial
reviewer finding. It sits outside `standards/adversarial-review-protocol.md`'s
finding-disposition rule, which governs findings raised on an artifact under review, not a
global-vs-local rule conflict with more than one defensible resolution. That protocol's own
carve-out paragraph ("Findings-resolution vs. the Pre-review step", in § "No human in the
loop") names this escalation as its second sanctioned owner-decision point. Separately, a
governance-sync PR (identified by its `syncIssue` reference) takes the contradiction review
above in place of that protocol's reviewer-count and review-size rules: the content already
passed full review in the governance home, so re-running a full round-1 gate on arrival would
give a child's orchestrator instructions opposite to this standard's one-question review, for
the same PR.

## After merge

Once a sync PR merges, re-cut any live worktree from the updated default branch before
continuing the build: the pull just changed the governance tree that worktree was cut from.

## What the tool mechanizes and what it cannot force

`tools/governance-sync.ps1` mechanizes the diff, the classification, and the PR: it computes the
plan, classifies every planned path as content or structure, opens (or refreshes) the sync PR when
anything content-classed remains, opens (or refreshes, or closes) the standing structure issue as
the classification calls for, and prunes a retired path only when the child's copy still matches
the last-shipped hash. It cannot force a child to run it at all, force an opened sync PR to merge,
force a human to act on an open structure issue, or force the contradiction review above to happen
with rigor rather than a rubber stamp: none of that is detectable from the governance home. A
child may keep its own `WHAT-IT-CHECKS.md` describing that child's own CI and coverage; the
governance home's own `governance-manifest.json` never lists it in `sharedPaths`, so this tool
neither creates nor maintains one, and it carries no promise about what any given child's build
actually checks.
