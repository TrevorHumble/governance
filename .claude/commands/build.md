---
description: Run the full issue-to-PR pipeline on a goal. Usage: /build <goal>
---

You are the orchestrator defined in `agents/orchestrator.md`. Follow all rules in `CLAUDE.md` and `standards/`.

## Model check: do this first

This pipeline requires the orchestrator to run on **Opus**. If the current session is not Opus, type `/model` and switch before continuing. Running the orchestrator below Opus degrades every decision in the loop.

Set `model:` explicitly on every spawn call; never rely on defaults. Role tiers, including the
`sonnet-only` award: `standards/pipeline/templates/model-tiers.md`.

## Goal

Run goal: $ARGUMENTS

## Pipeline

Execute the steps below in order. Do not skip or reorder.

**0: Isolate.** See `standards/pipeline/steps/01-isolate.md`.

**0b: Governance sync.** See `standards/pipeline/steps/02-sync.md`.

**1: Research.** See `standards/pipeline/steps/03-research.md`.

**2: Pre-review (if declared).** See `standards/pipeline/steps/04-pre-review.md`.

**2b: Owner hand-off.** See `standards/pipeline/steps/05-hand-off.md`.

**3: Issue.** See `standards/pipeline/steps/06-issue.md`.

**4: Issue review.** Spawn `agents/reviewer-issue.md` per `standards/adversarial-review-protocol.md` § "Spawning a reviewer". A FAIL is fixed, never overridden. Re-review with a fresh instance. `agents/reviewer-architecture.md` is not part of this step; its automatic PR-review trigger and on-request entry point are `standards/adversarial-review-protocol.md` § "Reviewer count by artifact" (see also `agents/orchestrator.md` § "Architecture lens (automatic on structural changes)"). On PASS, stamp the issue's `active-<N>-*` claim label (shape owned by `standards/issue-standards.md` § "The file claim and the size rule") and check the board for competing claims on its `Touches` files, per `standards/issue-standards.md` § "The file claim and the size rule"; if another run's live claim holds any of them, wait there (the issue review is already banked) instead of implementing into a collision.

**5: Implement.** Spawn `agents/implementation-agent.md` with the passing issue and all prior-art file paths.

**6: Artifact review.** Spawn the appropriate `agents/reviewer-*.md` against the artifact, per `standards/pipeline/templates/model-tiers.md` for which tier. Reviewer receives only the artifact and the relevant standard: no framing, no positive hints, no planted suspicions. For every implementation artifact, per `standards/adversarial-review-protocol.md` § "Reviewer count by artifact", also spawn `agents/reviewer-design-philosophy.md`. If the change adds a new component or makes a significant structural change, also spawn `agents/reviewer-architecture.md` at this step, no owner request required; see `agents/orchestrator.md` § "Architecture lens (automatic on structural changes)". All spawned reviewers must PASS before commit. Full stop-rule cadence for a later blocker/major finding: `standards/adversarial-review-protocol.md` § "Referee and the eight-round loop". Every code-review round's briefing file list is machine-generated, and `agents/reviewer-briefing.md` audits the round's briefings concurrently: `standards/adversarial-review-protocol.md` § "Spawning a reviewer". The briefing audit's judgment findings do not gate the commit; only the gating reviewers' PASSes and round validity (per `standards/adversarial-review-protocol.md` § "Spawning a reviewer" - Briefing audit) do. Round-scoping against the review-size bound (measure the round, split or declare before dispatch) is owned by `standards/adversarial-review-protocol.md` § "Review-size bound"; cited here, not restated. Dispatching a review round re-stamps the issue's `active-<N>-*` claim label, per `standards/issue-standards.md` § "The file claim and the size rule".

**7: Create branch, then commit.** Confirm isolation is still in effect before cutting the per-issue branch (per-issue branches are always cut inside the worktree, never in the primary checkout): `powershell -File tools/assert-worktree.ps1` (if it fails, this session did not properly complete step 0; return to step 0 before proceeding). Then create the descriptive branch, which ensures the commit lands on the new branch, not on the default branch:

```powershell
git switch -c <descriptive-branch-name>
```

Then confirm the hooks are live: `git config core.hooksPath` should print `.githooks` (if not, run `tools/setup-hooks.ps1` first). Then `git commit -F data/commitmsg-*.txt` with `(#N)` in the message. **Two hooks run at commit time:** `commit-msg` checks that a code commit's message names a GitHub issue (`(#N)`, a closing keyword, or an `issue-N` branch); a doc-only commit is exempt. If it blocks, add the missing reference. `pre-commit` checks that the commit stages no parent-owned governance path (see `standards/ownership-map.md`); once the launcher probe and the profile parse both succeed, it exits cleanly on a governance-sync branch (the exemption that applies in a child, since `governanceHome` is never `self` there) or in the governance home itself. There is no review-evidence file to record; review practice is unmechanized (see `WHAT-IT-CHECKS.md`).

**8: Ship.** How a passing change reaches the default branch defers to `repo-profile.json`'s
`shipMode` field; no step here asserts which mode is operative.

- **`shipMode: "pr"`:** push the branch and open a pull request using the gh CLI at the path
  declared in `repo-profile.json`'s `ghPath` field (default `gh`, on PATH; a machine where gh
  lives elsewhere records the absolute path in that machine's own `CLAUDE.local.md`, never
  committed): `gh pr create --body-file data/<body-file>`. Watch CI to green, then merge.
- **`shipMode: "direct"`:** commit straight to the default branch (no branch, no PR) and watch CI
  to green there.

Either way, write the per-ship entry as a new file, `buildlog/<N>-<PR>.md` (`N` the issue number;
`PR` the pull request number `gh pr create` assigned in `pr` mode, or the commit's short SHA in
`direct` mode), in the shape `buildlog/README.md` defines, and push it as a commit on the same
branch (or the default branch, in `direct` mode), so the fragment carries its own identifier and
the green CI run covers the final commit. Then:

- **Changes off any declared Pre-review surface:** merge (or, in `direct` mode, consider the ship
  complete) once the adversarial review has passed and CI is green. The owner does not perform
  merges; owner control is upstream (issue-speccing) and downstream (revert via git history).
- **Changes gated by a declared Pre-review step (step 2):** merge (or complete the direct-mode
  ship) once that Pre-review step has reached explicit owner approval AND the adversarial review
  has passed and CI is green. The declared Pre-review step is the owner's pre-merge control for
  this change type; issue-speccing and revert remain available as well. A change carried by that
  process file's unchanged-artifact exemption merges instead on what `agents/orchestrator.md`
  § "Pre-review step"'s "The unchanged-artifact exemption" paragraph states.

The default branch is never knowingly left red. If CI goes red, fix the cause or revert the
commit before proceeding. Then close the GitHub issue referencing the commit and delete its
`active-<N>-*` claim label (pushing re-stamped it; merge or close clears it, and a halt clears it
too, per `standards/issue-standards.md` § "The file claim and the size rule"). `BUILDLOG.md`
itself is not written here; the fragment written above carries this ship's record until
`/buildlog` folds it in.

**9: Report.** Once the session's work ends, wrap, ship, or halt, first run the late-note pass
when its trigger holds, per `agents/orchestrator.md` § "No agent
files its own issue" rule 4 (the trigger and its exemptions are owned by
`standards/adversarial-review-protocol.md` § "Reviewer count by artifact"'s Late-note pass
bullet; a session-ending halt runs it too, before its `[HALT]` report). Then
emit the end-of-run report, once
and only once per session, per `agents/orchestrator.md` § "No agent files its own issue", § "How
to write the report", and § "Report template". A session-ending halt's report already travels in
its `[HALT]` entry, so this step adds nothing there. The session's work ends when it stops working
in that worktree, not when one issue in it ships; a report already emitted is re-emitted, not
skipped, for any note taken afterward.

## Stop condition

A FAIL is fixed by the implementation agent and re-reviewed with a fresh reviewer instance, never overridden by the author, and never routed to a new issue or a `spawn_task` chip merely to end the round (`standards/adversarial-review-protocol.md` § "Finding disposition"). When the same blocker/major finding still stands after two or more rounds, a disputed finding routes to the referee (`agents/reviewer-referee.md`) and an undisputed one keeps looping to the ceiling set by `standards/adversarial-review-protocol.md` § "Referee and the eight-round loop", then halts the segment, logged in `BUILDLOG.md`, and the run continues with independent segments; a halt is not an acceptance. Full rule: `standards/adversarial-review-protocol.md` § "Referee and the eight-round loop".
