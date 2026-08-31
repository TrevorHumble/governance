# Referee and the eight-round loop

Full mechanics for `standards/adversarial-review-protocol.md` § "Referee and the eight-round
loop". Read the stub there first for the round-1 cadence and the no-panel rule; this file is the
one link deeper it points to, and covers the dispute fork, the eight-round ceiling, and the
referee's ruling.

**The fork, at two or more rounds on the same finding.** Round 1 raises a blocker or major
finding; the scoped re-check is round 2 on that finding, and a further undisputed re-check
advances the same finding to round 3, round 4, and onward. When the fresh reviewer raises the
same finding again at round 2 or any later round, which side the finding takes next depends on
whether the implementer disputes it:

- **Disputed**: the implementer has stated, on the record, an argument against the finding
  itself, with evidence, and the fresh reviewer raised the same finding again. Routes to the
  referee, `agents/reviewer-referee.md`. "Fixing is hard" is never a dispute: a dispute
  requires a stated argument against the finding itself, not a statement about the difficulty
  of fixing it. A dispute does not suspend the round-2 fix attempt: the implementer still
  produces its best fix and carries the dispute in the same hand-off, so round 2 has a real
  scoped diff to review. It is the fresh reviewer raising the same finding again against that
  fix that routes the dispute to the referee.
- **Undisputed** (the default: the implementer accepts the finding as a real defect, or
  raises no dispute at all): the fix-and-fresh-reviewer loop keeps running, one round at a
  time, to a ceiling of **eight** re-review rounds on that finding. The counting basis: the
  scoped re-check at round 2 is re-review round 1, and each further re-check advances the
  re-review count by one. If the eighth re-review round (round 9 overall) still has not
  produced a PASS on it, the segment halts (`agents/orchestrator.md` § "Stop condition").

**The referee's ruling is final on that finding.** A given finding is disputed at most once,
never a second time, regardless of which round raises the dispute. A **SUSTAIN** ruling (the
referee ruled for the reviewer) becomes undisputed for the rest of the run and re-enters the
loop above at its current ledger count, pre-referee rounds included, never reset to zero. An
**OVERTURN** ruling (the referee ruled for the implementer) drops the finding and closes its
ledger entry; the implementer does no further work on it. Full referee mechanics, input, and
output: `agents/reviewer-referee.md`.
