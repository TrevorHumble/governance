# Acceptance-criteria amendment (bounded, mid-flight)

Full mechanics for `standards/issue-standards.md` § "Acceptance-criteria amendment (bounded,
mid-flight)"; this file is what that stub points to.

An issue's acceptance criteria are not frozen the instant the issue passes review. They may be
amended mid-flight, but only under two conditions together: **owner approval plus one reviewer**
sign off on the amended text before the implementer treats it as the new contract. Neither alone
is sufficient: owner approval without a reviewer skips the adversarial check this whole standard
exists to force; a reviewer alone cannot authorize spending the owner's scope without the owner's
own approval.

The amendment is bounded to the issue's existing footprint: it may only add work **inside files
already on the issue's `Touches` list**. Put plainly, an amendment never adds a file. The
`Touches` list is a hard line set at issue-review time (it is what makes concurrent waves safe,
since two agents must never share a file). An amendment that needs a file outside that list is
not an amendment, it is a new issue: the owner directs it off the end-of-run report, filed and
reviewed on its own.

**A widening is not an amendment.** `standards/adversarial-review-protocol.md` § "Finding
disposition" disposition 1's widening adds a file outside `Touches` to repair a defect the change
itself caused. It changes no acceptance criterion and needs no owner-plus-reviewer sign-off,
unlike an amendment, which spends new scope on purpose. It also does not get the concurrency
property the `Touches` lock exists for, the same way: a widening lands after the mechanisms keyed
off the declared list have already run against the shorter list, both the by-hand in-batch
collision check at issue-review time and the `/realign` overlap report run through
`tools/check-freshness.ps1` (`.claude/commands/realign.md`), so file exclusivity for the
widened file rests on the widening being recorded, not on tooling that ran before it existed.

Example: an issue touching one service file may be amended to also validate a field's format
inside that same file, with owner + reviewer sign-off. It may not be amended to also touch an
unrelated admin route to add a moderation control: that is a new, separately-reviewed issue, even
if the owner wants it done "at the same time."

The "never adds a file" line above has exactly two exceptions, and neither is an amendment: the
disposition-1 widening (the paragraph above), and a size-rule claim under
`standards/issue-standards.md` § "The file claim and the size rule", the one sanctioned way a
`Touches` list grows mid-run without owner-plus-reviewer sign-off. Both are recorded on the
`Touches` line, so the list a reviewer reads is still the whole truth.

A change to the title, the user story, or an acceptance criterion after the owner has approved it
is not this section's amendment: it re-triggers the owner hand-off's approval step instead, per
`standards/issue-standards.md` § "Owner hand-off". This re-trigger keys off the `Owner-approved:
yes` marker. This section's `Touches` bound still binds any implementation work the amended text
creates; its owner-plus-reviewer sign-off does not apply to the owner's own approved words.

A night-pass issue's criteria take this section's amendment, not the re-trigger above: they are
agent-written words the owner never approved, so no `Owner-approved: yes` marker exists to
remove. The pass does not supply the amendment's owner half, per
`standards/pipeline/edge/night-pass.md`.
