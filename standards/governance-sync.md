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
its declared `sharedPaths` against the child's own tree, and, when there is anything to sync, opens (or
refreshes) a small pull request in the child carrying exactly that diff. Nothing merges
automatically: the PR sits until a contradiction review disposes of it, per this standard.

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

`tools/governance-sync.ps1` mechanizes the diff and the PR: it computes the plan, opens (or
refreshes) the sync PR, and prunes a retired path only when the child's copy still matches the
last-shipped hash. It cannot force a child to run it at all, force an opened sync PR to merge, or
force the contradiction review above to happen with rigor rather than a rubber stamp: none of
that is detectable from the governance home. A child may keep its own `WHAT-IT-CHECKS.md`
describing that child's own CI and coverage; the governance home's own `governance-manifest.json`
never lists it in `sharedPaths`, so this tool neither creates nor maintains one, and it carries no
promise about what any given child's build actually checks.
