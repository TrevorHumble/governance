# The Pipeline

Each entry below summarizes its step. The step's packet is the authoritative home of every rule;
where the two differ, the packet wins.

## 01. Isolate

Run every step inside your own git worktree, never the shared primary checkout. If you are not
already isolated, cut a fresh worktree from the remote default branch, never from local HEAD.
Whether you just cut the worktree or were already inside one, confirm it reports zero commits
behind the remote default branch before you continue.

Packet: `standards/pipeline/steps/01-isolate.md`

## 02. Sync

Pull governance updates from the parent repo before any other step touches a file. Read the sync
outcome and act on what it means; the packet lists every outcome. Continue the build on the
governance already in the tree either way; a merged sync lands on a later run, not this one.

Packet: `standards/pipeline/steps/02-sync.md`

## 03. Research

Delegate research to `agents/researcher.md`. It checks local prior art first (the codebase,
`standards/`, `agents/`, skill directories, `docs/`, `DESIGN.md`), then installed package docs and
existing tests, and treats web search as a last resort. Do not research what prior art already
answers.

Packet: `standards/pipeline/steps/03-research.md`, `standards/pipeline/templates/model-tiers.md`

## 04. Pre-review

If this repo declares a pre-review process, settle the artifact live against the owner before an
issue is drafted or an implementer runs. A repo declaring no pre-review process, or a change the
declaring process's own unchanged-artifact exemption covers, skips straight to hand-off. Edit only
the declared surface paths while nothing has merged yet.

Packet: `standards/pipeline/steps/04-pre-review.md`

## 05. Hand-off

Before creating the issue, send the owner the title, the user story, and the acceptance criteria,
in that order, nothing else. Wait for approval before writing anything to GitHub, except for a
child inheriting an approved epic's approval. Use the written format in
`standards/pipeline/templates/hand-off-format.md` on every send. A change to any approved word
afterward follows the return path in `standards/issue-standards.md` § "Owner hand-off".

Packet: `standards/pipeline/steps/05-hand-off.md`, `standards/pipeline/templates/hand-off-format.md`

## 06. Issue

Read the issue the run was handed, or open a new one first and capture the assigned number, then
write the local draft naming that number. Write the issue per the issue standard: user story,
acceptance criteria, implementation plan, dependency map. GitHub is the single source of truth
from the moment the issue exists.

Packet: `standards/pipeline/steps/06-issue.md`

## 07. Issue review

Spawn exactly one issue reviewer against the draft. Fix every blocking defect and re-review with a
fresh instance; never override a FAIL. On PASS, stamp the claim label per
`standards/issue-standards.md` § "The file claim and the size rule" and check the board for
competing claims on the issue's touched files before implementation starts.

Packet: `standards/pipeline/steps/07-issue-review.md`, `standards/pipeline/templates/spawn-skeleton.md`,
`standards/pipeline/templates/model-tiers.md`

## 08. Implement

Spawn the implementation agent with the passing issue and every prior-art path it needs. The
implementer satisfies each acceptance criterion, confirms API signatures against real
documentation, and hands back the required self-check fields alongside the artifact.

Packet: `standards/pipeline/steps/08-implement.md`, `standards/pipeline/templates/model-tiers.md`

## 09. PR review

Spawn the reviewers this change needs: the PR reviewer, the design-philosophy gate for every
implementation artifact, and any lens whose trigger fires. Fix every blocker and major, re-check
with a fresh reviewer, and route a disputed repeat finding to the referee. Every round's briefing
is machine-generated and audited before its verdict is accepted.

Packet: `standards/pipeline/steps/09-pr-review.md`, `standards/pipeline/templates/spawn-skeleton.md`,
`standards/pipeline/templates/model-tiers.md`

## 10. Commit

Confirm isolation, cut the run's per-issue branch in `pr` mode, and confirm the commit hooks are
live before the run's first commit. Commit only after every gating reviewer has passed, with a
message naming the issue, and re-stamp the claim label on commit.

Packet: `standards/pipeline/steps/10-commit.md`

## 11. Ship

Push (re-stamping the claim label) and open a pull request, or push the default branch (`git
push`, re-stamping the claim label) so the commit is published, per this repo's declared ship
mode. Watch CI to green, then
merge; never leave the default branch red. Write the per-ship fragment naming the shipped
identifier before the merge. Then close the GitHub issue and release its claim label, per
`standards/issue-standards.md` § "The release rule".

Packet: `standards/pipeline/steps/11-ship.md`

## 12. Report

Run the late-note pass when its trigger holds, then write the end-of-run report once per session.
Every surviving note carries all four priced options, summing to 100, and the agent never picks
for the owner. A session with zero notes still reports, in one line.

Packet: `standards/pipeline/steps/12-report.md`, `standards/pipeline/templates/report-template.md`,
`standards/pipeline/templates/model-tiers.md`
