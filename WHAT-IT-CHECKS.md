# What a green build actually proves

Plain-English guide for the owner. This explains what a passing build checks for this repo, and
what it cannot check, where you remain the eye after the fact.

---

## What the green checkmark proves

When all checks pass, these things have been confirmed automatically, without anyone reading the code:

**The test suite runs on every push and every pull request.**
`npm test` (`vitest run`) runs in GitHub's CI system on every push and every pull request. It
checks that this repo's own logic, and any scripts and tooling it ships, produce the right
results, not just that the code ran without crashing.

**Newly added lines are checked for the no-em-dash writing rule, but only on a pull request.**
`scripts/check-emdash.js` rejects a pull request or merge-queue run whose added lines contain an
em dash or an HTML entity spelling of one. It does not run on a plain push to a branch, only on
`pull_request` and `merge_group` events, so a long-lived branch's own history never blocks its
everyday pushes. It judges only the lines a PR adds against the merge-base diff with this repo's
default branch (see `repo-profile.json`'s `defaultBranch` field), never the existing tree, and it
recognizes two escapes: a genuine `git revert`, and a line moved rather than newly written. It
does not reach commit messages, pull request bodies, or GitHub issue bodies. Those stay enforced
by discipline, not CI. **It also cannot see into a file git treats as binary** (for example a
`.md` file saved with UTF-16 encoding): git's own diff machinery reports no text lines for a
binary-classified file, so an em dash inside one passes with nothing to flag. This is a known,
inherited limitation of reading `git diff` text, not something this repo's port fixed.

**A code commit must name a GitHub issue.**
A cheap local check (`.githooks/commit-msg`) blocks a commit that changes a non-`.md` file and
names no GitHub issue: `(#N)` in the message, a GitHub closing keyword (`Closes #N`, `Fixes #N`,
`Resolves #N`), or a branch named `feat/issue-N`. This proves the change is tied to a tracked
piece of work. It does not prove that work was reviewed; see the honest limit below.

**Checks this repo does not currently have.** A prior repo this checklist is ported from also ran
a linter, a standalone formatter gate, a mutation-testing report, a smoke test against a running
instance, a coverage threshold, a container-build check, and GitHub-native CodeQL and Dependabot
scanning. None of those run in this repo as of this writing: there is no `eslint`, no standalone
`format:check` step, no mutation job, no smoke job, no coverage gate on the test run, no Docker
build step, and no CodeQL or Dependabot workflow configured. One partial exception: `prettier` is
a devDependency here too, but only as a library the buildlog test suite calls directly (to assert
a folded `BUILDLOG.md` stays formatting-clean); it is not run as its own CI job or `npm run`
script. If any of these get added later, this file should be updated to describe them rather than
left describing checks that do not run.

---

## What review actually is, honestly

Every PR is intended to go through independent, adversarial review before merge, per
`standards/adversarial-review-protocol.md` where that standard exists for this repo. That review
practice is real when it is followed and is how a project set up this way is meant to work day to
day. But **there is no mechanical gate that blocks a commit or a merge for lacking a review**.
No file records that a review happened; no check confirms one before code lands. The commit-msg
check above only confirms an issue is named, not that its review passed.

This is a deliberate trade, not an oversight. The wedding-scavenger-hunt repo this checklist is
ported from once did try to mechanically enforce review evidence: a commit gate that blocked a
commit without a recorded passing review tied to the exact code. That machinery itself became the
dominant source of defects and review overhead, at the cost of the actual work it was meant to
protect, and was retired. Review practice continued; only the machinery that tried to prove it
happened was removed. This repo starts from that lesson already learned rather than repeating the
experiment: review practice is real, only the "prove it happened" layer is deliberately absent.

---

## What the checks cannot answer, where you are the eye after the fact

A machine can confirm the logic is right. It cannot confirm the result **looks** right or that it
is what you **meant**.

Bug fixes, correctness work, and most changes merge automatically once adversarial review passes
and the build is green. Your control there is upstream (which work gets specced, via issues) and
downstream (revert, via git history), not a pre-merge checkpoint: you review the live result after
the fact and can request changes or revert if it isn't what you wanted.

**Some changes are different: their effect can only be judged by looking, not by running a
check.** When a repo declares a Pre-review process (see `repo-profile.json`'s `preReview` field),
a change whose effect is only checkable that way goes through that process before it merges. This
repo currently declares none (`preReview: "none"`); if that changes, this file and
`definition-of-done.md` clause 9 should be updated together.

**Stated but unmechanized: this repo's README describes a "children pull governance updates on
build" rule** (every child repo checks this repo for updates at build start, and a pull lands as
a small PR in the child with a lightweight review). As of this writing there is no CI job or other
mechanical enforcement that actually runs that pull, or verifies a child has done it. It is a
stated policy, not a checked one, pending a follow-up sync issue to wire it up.

**Green means the test suite passes and newly added lines carry no em dash. For anything whose
correctness depends on how it looks or reads to a person, that judgment is still yours.**
