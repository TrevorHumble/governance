---
description: Run the full issue-to-PR pipeline on a goal. Usage: /build <goal>
---

You are the orchestrator defined in `agents/orchestrator.md`. Follow all rules in `CLAUDE.md` and `standards/`.

## Model check: do this first

This pipeline requires the orchestrator to run on **Opus**. If the current session is not Opus, type `/model` and switch before continuing. Running the orchestrator below Opus degrades every decision in the loop.

Set `model:` explicitly on every spawn call; never rely on defaults. Role tiers, including the
`sonnet-only` award: `agents/orchestrator.md` § "Model policy".

## Goal

Run goal: $ARGUMENTS

## Pipeline

Execute the steps below in order. Do not skip or reorder.

**0: Isolate.** Before any research or file mutation, run `powershell -File tools/assert-worktree.ps1`. If it exits non-zero (the session is running in the shared primary checkout, not an isolated worktree), run `powershell -File tools/new-agent-worktree.ps1 -Branch <session-branch>`, which fetches `origin/main` first and cuts the new branch from it, never from local HEAD, so the worktree starts 0 commits behind regardless of how stale the primary checkout's local `main` is (the wedding-scavenger-hunt repo's issue #357 records the incident and rationale behind this design); then `cd` into the returned worktree path and run every remaining step of this pipeline from inside it. If it exits `0`, the session is already isolated: continue in place.

Either way, once inside the worktree, run `powershell -File tools/check-freshness.ps1` **against this worktree** before proceeding to step 1. Expect `0 commits behind origin/main` for a freshly-cut one. **This bypasses the primary checkout's own behind-count entirely: the primary checkout being stale never aborts the build**, because the worktree was cut straight from `origin/main`, not from the primary checkout's local `main`. If the check instead reports drift (its output names the count with the literal phrase `commits behind`), resync per its instructions before continuing.

**1: Research.** Before drafting anything, check local prior art: the codebase itself, `standards/`, `agents/`, `.claude/skills/`, `.agents/skills/`, `docs/`, `DESIGN.md`. For questions about the project's own stack and dependencies, consult the installed package docs and existing tests in `tests/`. Web search is a last resort when local sources do not answer the question: delegate through `agents/researcher.md`.

**2: Pre-review (if declared).** Before issue-drafting, run this repo's declared Pre-review step (see `repo-profile.json`'s `preReview` field, a repo may name its own pre-review process file, such as a live visual-approval loop, or declare `none`; `surfaceGlobs` names the pre-review surface when one is declared). No shared command doc here asserts which pre-review process any particular repo uses.

When `preReview` is `none`, or the work falls outside `surfaceGlobs`, skip this step entirely and go straight to step 3. Otherwise, follow the declared process file for its own edit-scope, approval, and hand-off rules: this shared pipeline doc does not restate them here.

Only once that declared process reports approval does step 3 (issue) draft the transcribed criteria and step 5 (implement) spawn an implementer for the remaining work, per `standards/issue-standards.md` for how an approved pre-review result becomes an acceptance criterion.

**3: Issue.** Create the GitHub issue first (`gh issue create --label needs-issue-review`, labelled by tier, using the gh CLI at the path declared in `repo-profile.json`'s `ghPath` field, default `gh` on PATH; a machine where gh lives elsewhere records the absolute path in that machine's own `CLAUDE.local.md`, never committed), and capture the assigned number `N`. Then write the draft as `data/wip-issues/<N>-slug.md` per `standards/issue-standards.md`. GitHub is the single source of truth: the board reflects the task from creation.

**4: Issue review.** Spawn `agents/reviewer-issue.md` per `standards/adversarial-review-protocol.md` § "Spawning a reviewer". A FAIL is fixed, never overridden. Re-review with a fresh instance. `agents/reviewer-architecture.md` is not part of this step; its automatic PR-review trigger and on-request entry point are `standards/adversarial-review-protocol.md` § "Reviewer count by artifact" (see also `agents/orchestrator.md` § "Architecture lens (automatic on structural changes)").

**5: Implement.** Spawn `agents/implementation-agent.md` with the passing issue and all prior-art file paths.

**6: Artifact review.** Spawn the appropriate `agents/reviewer-*.md` against the artifact, per `agents/orchestrator.md` § "Model policy" for which tier. Reviewer receives only the artifact and the relevant standard: no framing, no positive hints, no planted suspicions. For every implementation artifact, per `standards/adversarial-review-protocol.md` § "Reviewer count by artifact", also spawn `agents/reviewer-design-philosophy.md`. If the change adds a new component or makes a significant structural change, also spawn `agents/reviewer-architecture.md` at this step, no owner request required; see `agents/orchestrator.md` § "Architecture lens (automatic on structural changes)". All spawned reviewers must PASS before commit. Full stop-rule cadence for a later blocker/major finding: `standards/adversarial-review-protocol.md` § "One-round stop rule". Every code-review round's briefing file list is machine-generated, and `agents/reviewer-briefing.md` audits the round's briefings concurrently: `standards/adversarial-review-protocol.md` § "Spawning a reviewer". The briefing audit's judgment findings do not gate the commit; only the gating reviewers' PASSes and round validity (per `standards/adversarial-review-protocol.md` § "Spawning a reviewer" - Briefing audit) do. Round-scoping against the review-size bound (measure the round, split or declare before dispatch) is owned by `standards/adversarial-review-protocol.md` § "Review-size bound"; cited here, not restated.

**7: Create branch, then commit.** Confirm isolation is still in effect before cutting the per-issue branch (per-issue branches are always cut inside the worktree, never in the primary checkout): `powershell -File tools/assert-worktree.ps1` (if it fails, this session did not properly complete step 0; return to step 0 before proceeding). Then create the descriptive branch, which ensures the commit lands on the new branch, not on main:

```powershell
git switch -c <descriptive-branch-name>
```

Then confirm the hooks are live: `git config core.hooksPath` should print `.githooks` (if not, run `tools/setup-hooks.ps1` first). Then `git commit -F data/commitmsg-*.txt` with `(#N)` in the message. **One hook runs at commit time:** `commit-msg` checks that a code commit's message names a GitHub issue (`(#N)`, a closing keyword, or an `issue-N` branch); a doc-only commit is exempt. If it blocks, add the missing reference. There is no review-evidence file to record; review practice is unmechanized (see `WHAT-IT-CHECKS.md`).

**8: Ship: push, then PR, then CI, then merge on green.** Push the branch and open a pull request using the gh CLI at the path declared in `repo-profile.json`'s `ghPath` field (default `gh`, on PATH; a machine where gh lives elsewhere records the absolute path in that machine's own `CLAUDE.local.md`, never committed):

`gh pr create --body-file data/<body-file>`. Then write the per-ship entry as a new file, `buildlog/<N>-<PR>.md` (`N` the issue number, `PR` the pull request number `gh pr create` just assigned), in the shape `buildlog/README.md` defines, naming the PR and never the merge SHA (which does not exist yet), and push it as a commit on this same branch, so the fragment carries its own PR number and the green CI run covers the final commit. Watch CI to green. Then:

- **Non-visual change types, e.g. bug fix, security fix, refactor, correctness, tests:** merge once the adversarial review has passed and CI is green. The owner does not perform merges; owner control is upstream (issue-speccing) and downstream (revert via git history).
- **Changes gated by a declared Pre-review step (step 2):** merge once that Pre-review step has reached explicit owner approval AND the adversarial review has passed and CI is green. The declared Pre-review step is the owner's pre-merge control for this change type; issue-speccing and revert remain available as well.

`main` is never knowingly left red. If CI goes red, fix the cause or revert the commit before proceeding. Then close the GitHub issue referencing the commit. `BUILDLOG.md` itself is not written here; the fragment written above carries this ship's record until `/buildlog` folds it in.

## Stop condition

A FAIL is fixed by the implementation agent and re-reviewed with a fresh reviewer instance, never overridden by the author, and never routed to a new issue or a `spawn_task` chip merely to end the round (`standards/adversarial-review-protocol.md` § "Finding disposition"). If a segment cannot reach PASS after two full re-review rounds on the same blocker/major finding, halt the segment, log it in `BUILDLOG.md`, and continue with independent segments; a halt is not an acceptance. Full rule: `standards/adversarial-review-protocol.md` § "One-round stop rule".
