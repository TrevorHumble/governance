# 09: PR review

Spawn the reviewers this change needs, tier per `standards/pipeline/templates/model-tiers.md`,
each briefing assembled from `standards/pipeline/templates/spawn-skeleton.md`: the PR reviewer and
the design-philosophy reviewer gate round 1 for every implementation artifact, both must PASS. A
doc-only or typo-only change outside a rendered user-facing surface skips only the
design-philosophy gate; an `.md` file that is itself an agent spec, a skill, or a standard is an
implementation artifact and never doc-only, per `standards/adversarial-review-protocol.md` §
"Reviewer count by artifact". A reviewer receives only the artifact under review and the relevant
standard: no framing, no positive hints, no planted suspicions.

Before dispatch, measure and scope the round per `standards/adversarial-review-protocol.md` §
"Review-size bound": that section is the one home of the measure, the threshold, the known limit
for move-shaped rounds, and the split-or-declare disposition.

**Dispatch the briefing audit concurrently.** Every code-review round, round 1 and every scoped
re-check alike, also dispatches `agents/reviewer-briefing.md` over that round's briefings,
concurrently with the gating reviewers, never before or after. Its judgment findings are advisory;
a scope-mismatch report is a round-validity condition instead.

**The ordinary per-round cadence.** Minor and nit findings are fixed inline by the implementer and
shipped with no re-review. A blocker or major finding takes one scoped re-check: the implementer
fixes it, and one fresh reviewer confirms the fix, not a full re-review of the whole artifact. A
FAIL is fixed, never overridden by the author, and never routed to a new issue or a `spawn_task`
chip merely to end the round.

**Bind the round.** Run `git write-tree` and record the oid in the briefing. Before accepting any
verdict, re-run `git write-tree`; a changed oid means the tree was mutated mid-review and the round
is invalid regardless of verdict (`standards/adversarial-review-protocol.md` § "Spawning a
reviewer").

**Verify before accepting a PASS.** Confirm every cited URL resolves, every `file:line` exists at
that location, and every item in scope has an explicit finding; this check is the orchestrator's
own, never delegated (`standards/adversarial-review-protocol.md` § "The spawner must never" item
5).

Dispatching a review round re-stamps the issue's `active-<N>-*` claim label, per
`standards/issue-standards.md` § "The release rule".

Rare case: a blocker or major finding that survives a second round, disputed or not, the
eight-round ceiling, and the referee's ruling: `standards/adversarial-review-protocol.md` §
"Referee and the eight-round loop".

Rare case: the architecture lens gates round 1 automatically when the change adds a new component
or makes a significant structural change: `standards/adversarial-review-protocol.md` § "Reviewer
count by artifact".

Rare case: the security lens and the doc-currency step, each dispatched only when its own trigger
fires: `standards/adversarial-review-protocol.md` § "Which reviews does this change need?" for the
security lens; `agents/orchestrator.md` § "Doc-currency step" for doc-currency.

Rare case: a finding that never produces a PASS halts the segment instead of shipping it:
`agents/orchestrator.md` § "Stop condition".
