# What a green build actually proves

Plain-English guide for the owner. This explains what a passing build checks for this repo, and
what it cannot check, where you remain the eye after the fact.

---

## What the green checkmark proves

When all checks pass, these things have been confirmed automatically, without anyone reading the code:

**The test suite runs on every push to `main` and every pull request.**
`npm test` (`vitest run`) runs in GitHub's CI system on every push to `main` and every pull
request. It checks that this repo's own logic, and any scripts and tooling it ships, produce the
right results, not just that the code ran without crashing.

**Newly added lines are checked for the no-em-dash writing rule, but only on a pull request in
CI; a local run also checks your dirty working tree.** `scripts/check-emdash.js` rejects a pull
request or merge-queue run whose added lines contain an em dash or an HTML entity spelling of
one. It does not run in CI on a plain push to `main`, only on `pull_request` and `merge_group`
events: that push has no pull request, so there is no merge-base diff of added lines for it to
judge. In CI, on a clean checkout, it judges only the lines a PR adds against the merge-base diff
with this repo's default branch (see `repo-profile.json`'s `defaultBranch` field), never the
existing tree. Run locally with `npm run check:emdash`, it additionally scans your uncommitted
work in three forms: staged changes, unstaged changes, and new untracked files that are not
gitignored, each read under its real on-disk file name rather than a quoted rendering for a name
with non-ASCII bytes (so a file name with, say, an accented letter is scanned and reported
correctly, not silently skipped or misreported). It recognizes two escapes: a genuine `git
revert`, whose committed-range suppression never reaches the uncommitted-work scan, and a line
moved rather than newly written. It does not reach commit messages, pull request bodies, or
GitHub issue bodies. Those stay enforced by discipline, not CI. Three known gaps remain in the
local scan, all named here rather than left implicit: **it cannot see into a file git treats as
binary** (for example a `.md` file saved with UTF-16 encoding) in any of the three uncommitted
forms, not only the committed range -- git's own diff machinery reports no text lines for a
binary-classified file, so an em dash inside one passes with nothing to flag, a known, inherited
limitation of reading `git diff` text, not something this repo's port fixed; **the untracked-file
scan is capped at 2000 files** (`MAX_UNTRACKED_FILES` in `scripts/check-emdash.js`), failing loud
rather than silently skipping the excess, because each untracked file costs one `git diff
--no-index` subprocess spawn and an un-gitignored build-output directory could otherwise spawn
thousands of them in one local run; and **a file name containing a double quote, a backslash, or
a control character still prints in git's escaped form, with the diff `b/` prefix still attached**
(the prefix-stripping this check does only matches an unquoted leading `a/` or `b/`), not its
literal bytes -- git always escapes those three regardless of `core.quotePath` (see that setting's
own documentation), unlike a non-ASCII byte, which `core.quotePath=false` does un-escape. The
violation is still counted and still fails the check; only the printed file name is affected.

**A code commit must name a GitHub issue.**
A cheap local check (`.githooks/commit-msg`) blocks a commit that changes a non-`.md` file and
names no GitHub issue: `(#N)` in the message, a GitHub closing keyword (`Closes #N`, `Fixes #N`,
`Resolves #N`), or a branch named `feat/issue-N`. This proves the change is tied to a tracked
piece of work. It does not prove that work was reviewed; see the honest limit below.

**A child repo commit cannot stage a parent-owned governance path.** A second cheap local check
(`.githooks/pre-commit`) blocks a commit that stages a path `governance-manifest.json`'s
`sharedPaths` names, except on a governance-sync branch; see `standards/ownership-map.md` for what
"parent-owned" means and its § "The redirect rule" for where such a change belongs instead. It
exits cleanly in any repo that has not declared `repo-profile.json`, with no PowerShell launcher
needed for that case; every other clean exit, including the governance-sync-branch exemption and
the governance home itself, runs only once a PowerShell launcher is found and the profile parses,
since both checks happen first. The blocked exits do not share that guarantee: no launcher found,
and a `repo-profile.json` that exists but fails to parse, are each themselves a blocking exit
reached before the profile has parsed. Like the commit-msg check, it is local and bypassable with
`--no-verify`, and no CI job backstops it yet; a child repo also needs a CI guard job for this,
which this repo does not yet ship.

**A PR containing a lint or formatting violation cannot merge.** `npm run lint` (`eslint . --max-warnings=0`)
and `npm run format:check` (`prettier --check .`) both run in CI on every push to `main` and every
pull request, in the same required `build` job as the test suite. This exists so the parent never
ships a shared file its children's own required lint/format checks would bounce; see `DESIGN.md`
for the fuller rationale. `prettier` also has a second, older use: the buildlog test suite calls it
directly as a library, to assert a folded `BUILDLOG.md` stays formatting-clean; that use predates
and is separate from the CI step.

**Checks this repo does not currently have.** A prior repo this checklist is ported from also ran
a mutation-testing report, a smoke test against a running instance, a coverage threshold, a
container-build check, and GitHub-native CodeQL scanning. None of those run in this repo as of
this writing: there is no mutation job, no smoke job, no coverage gate on the test run, no Docker
build step, and no CodeQL workflow configured. If any of these get added later, this file should
be updated to describe them rather than left describing checks that do not run.

---

## What runs automatically but is not part of a green build

Two things in this repo run on their own schedule or trigger, outside the `build` job. A green
checkmark says nothing about either, so they are kept out of the section above.

**An issue opened without the `needs-issue-review` label is flagged, not blocked.**
`.github/workflows/issue-guard.yml` runs on every `issues: opened` event, not on a build. If the
new issue already carries `needs-issue-review`, the sanctioned birth state applied by
`gh issue create --label`, it does nothing. If not, it adds a comment explaining the gap and the
`unverified-issue` label, for visibility only: the issue is not closed and nothing else is
blocked. Because it fires on issue creation, it can only ever run from the copy of the file on
the default branch.

**Dependabot opens its own pull requests for outdated dependencies.**
`.github/dependabot.yml` configures GitHub-native Dependabot, which runs on GitHub's weekly
schedule, on two ecosystems: `github-actions` and `npm`, both at directory `/`. Most bumps arrive
grouped rather than one pull request per package: all GitHub Actions bumps together, and npm
development bumps together. Npm production bumps are grouped only for minor and patch versions, so
a production major bump arrives as its own ungrouped pull request. Those pull requests still have
to pass the same `build` job, and their tier for merge is decided by `.claude/rules/dependencies.md`
and `tools/classify-dep-pr.ps1`, not by this file.

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

**Note challenging is judgment, mostly unmechanized.** Every end-of-run note is meant to be
challenged by a reviewer other than the agent that wrote it (`agents/orchestrator.md` § "No agent
files its own issue"; `standards/adversarial-review-protocol.md` § "Finding disposition",
"Challenging a deferral"; `agents/reviewer-notes.md`). What is mechanized and tested is only the
exact-match layer: a recorded decline in `owner-declines.md` suppressing a note, and an open
issue's title or `Touches` line covering one, both on the normalized one-line substance key
(`tools/note-check-core.ps1`, pinned by `tests/note-check.test.js`). Whether a justification
holds, whether the late-note pass was actually dispatched, and whether a confident drop was
agreed to are reviewer and orchestrator judgment, instruction-enforced like the rest of review
practice above; no gate proves they happened.

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

**What `tools/governance-sync.ps1` mechanizes, and what it cannot force:** see
`standards/governance-sync.md` § "What the tool mechanizes and what it cannot force" for the one
statement of this; it is not restated here.

**Green means the test suite passes, `eslint` and `prettier --check` both exit 0, and newly added
lines carry no em dash. For anything whose correctness depends on how it looks or reads to a
person, that judgment is still yours.**
