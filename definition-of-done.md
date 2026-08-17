# Definition of Done

A checklist for judging whether a change is actually finished, not just merged. The PR reviewer applies this alongside the issue's acceptance criteria (`agents/reviewer-pr.md`); an unmet clause is a defect, not a nice-to-have. Ten clauses, each a short rule with a concrete example. Read it in under two minutes.

**Why this exists.** In the wedding-scavenger-hunt repo (the project this checklist is ported
from), a feature shipped a create path for a user-generated item with no delete or edit path
(that repo's issue #410). A follow-up issue meant to track the gap was closed as filed-in-error,
and the gap itself went untracked by any open issue. Nobody decided "no delete", it just wasn't
in the acceptance criteria, so it fell off. This list exists so that gap gets caught before
merge, not discovered by an operator after the fact.

---

## 1. Failure state

Every feature defines what happens when something goes wrong, not only the happy path. A bad input, a dropped network request, an empty result: each has a defined, visible behavior, not a blank screen or a silent crash.

Example: an upload feature that only specifies "a user submits a file, it appears in the feed" is half a spec. It also needs to say what the user sees when the file is rejected (wrong type, too large, upload interrupted).

## 2. Operator takedown path (the whole-feature test)

If a change lets an operator or user create a thing, a comment, an upload, a note, a task, the same change gives them a way to undo, edit, or remove it. Ask, for anything the change can create: once this ships, is anyone **trapped, or merely wanting**? "Trapped" means no path out at all: a bad entry stays forever. "Wanting" means a real but lower-priority improvement, like wanting to reorder favorites, that can wait for its own issue. A change owns every state it can create: if it can create a thing, it must also cover that thing being wrong, failing, or needing to go away.

Example: in the wedding-scavenger-hunt repo, the same create-with-no-delete-path gap named above (that repo's issue #410) is the pattern: the operator who created a bad entry was trapped, not merely wanting, and that is the gap this clause exists to catch.

Mechanically enforced at: the PR reviewer's create/delete/hide/restore/resubmit checklist item (`agents/reviewer-pr.md`); this clause is that item's whole-feature framing, checked once there.

## 3. Production-sized data

A feature is tested and reasoned about at a realistic peak-load scale, not against a handful of rows in a dev database. A route that returns every row, with no pagination or size bound, can look fine with three test records and fall over with three hundred.

Example: a feed endpoint written and tested against five seeded records may hide an unbounded query that only shows up once real users start creating them at volume.

Mechanically enforced at: the PR reviewer's unbounded-route checklist item (`agents/reviewer-pr.md`); this clause is that item's whole-feature framing, checked once there.

## 4. User undo

Any user-facing action a user could plausibly get wrong, submitting the wrong file for a task, mistagging an entry, has an edit or undo path before go-live, not a promise to add one later. Users are not expected to get a support ticket filed and resolved mid-use.

Example: if a user can submit a file to the wrong task, they need a way to fix that themselves (resubmit, retag) rather than being stuck with a wrong entry until an operator notices.

## 5. Notes match the app

Whatever the PR description, issue notes, or in-app copy claims the feature does, the running app actually does. A reviewer or owner who reads the notes and then opens the app should see the same behavior described, not a stale description of an earlier draft, or an aspirational one for behavior that never got built.

Example: if the PR says "operators can hide a submitted entry from the feed," the admin screen in that same diff actually has a working hide control, not a placeholder button or a claim about a future PR.

## 6. Clean test run

The test suite is run on a fresh tree, one that is not behind `origin/main`, using `npm ci` (not a stale local `node_modules`), with the CI run itself treated as authoritative over any local pass. A local environment that predates the change, or that drifted from the lockfile, can go green while CI would go red. Every failing test is diagnosed to a specific, named cause before it is dismissed or deferred: an undiagnosed red test is not a license to file a follow-up issue and move on.

Example: a test fails locally, the author reruns it once, it passes, and they ship without knowing why it flaked: that is not a clean run. The cause (a timing race, a shared fixture, a real bug) has to be named.

## 7. Recorded omissions

Anything deliberately left out of a change, deferred behavior, an edge case ruled out of scope, a known limitation, is written down in the issue or PR, not silently dropped. A reader should be able to tell the difference between "we didn't think of this" and "we decided not to do this, on purpose, for this reason."

Example: a PR's own "Deliberately not in scope" note (no mechanical DoD checker, no CI job) is the pattern: the omission is named, not discovered later as a surprise gap.

## 8. Regressions you caused

If a change breaks something that worked before the change, fixing that break is part of finishing the change, not a new issue filed for someone else to pick up later. A regression you introduced is your defect, on your branch, before merge.

Example: a change to the export path that causes an existing listing view to 500 is not "done" with a note saying "listing bug filed as #999": it's not done until the listing works again.

## 9. Pre-review-gated changes

Any change whose effect is only checkable via this repo's declared Pre-review process (see `repo-profile.json`'s `preReview` field) goes through that process before it merges, when one is declared. This clause does not restate that process's mechanics; it exists so such a change cannot be called done while skipping it.

Example: a redesigned settings screen is not done at "the code renders it correctly": it's done once someone has actually looked at it rendered and signed off.

## 10. Done means live

An issue whose last step is a manual action by the owner or on GitHub itself, flipping a repo setting, turning on a required check, enabling a feature flag, is **not done when the code merges**. It is done when that manual step has actually been taken and the described behavior is true in production, not just possible in production.

Example: in the wedding-scavenger-hunt repo (that repo's issues #48 and #431), two issues both closed as done while their final manual step was never carried out; a required check that was supposed to be turned on stayed off, and a branch-protection setting that was supposed to change stayed unchanged, despite the issue closing as if the change had taken effect. Both looked green on the board and were false in reality. This clause exists so that stops counting as done.

At PR-review time, before the manual step can possibly have run, this clause is satisfied by confirming the step is recorded and the issue cannot auto-close as done ahead of it: full liveness is confirmed at issue-closure, not against the diff (see `agents/reviewer-pr.md` § "Apply the Definition of Done").
