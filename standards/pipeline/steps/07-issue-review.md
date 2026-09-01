# 07: Issue review

Spawn exactly one fresh `agents/reviewer-issue.md`, tier per
`standards/pipeline/templates/model-tiers.md`, its briefing assembled from
`standards/pipeline/templates/spawn-skeleton.md`. Issues always use a single reviewer, never a
panel.

A FAIL is fixed, never overridden. Re-review with a fresh reviewer instance, every round.

On PASS, in the same breath: clear the `needs-issue-review` label, and stamp the issue's
`active-<N>-*` claim label (shape owned by `standards/issue-standards.md` § "The file claim and
the size rule"), except an issue whose `Touches` is none and whose implementation plan files
child issues, an epic, which stamps no label at all, per that same section. Then check the board
for competing claims on the issue's `Touches` files: if another run's live claim holds any of
them, wait for the hold to release, or clear it if stale, per that section's release rule, rather
than starting implementation into a collision.

Rare case: `agents/reviewer-architecture.md` is not part of this step; its automatic trigger and
on-request entry point are `standards/adversarial-review-protocol.md` § "Reviewer count by
artifact".

Rare case: an issue carrying a `Night-pass:` marker takes the full checklist plus the marker
check: `standards/pipeline/edge/night-pass.md`.
