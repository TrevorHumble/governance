# 04: Pre-review

Before an issue is drafted or an implementer runs, check whether this repo declares a Pre-review
process (`repo-profile.json`'s `preReview` field; a repo may name its own process, such as a live
visual-approval loop, or declare `none`). A repo declaring `none`, or a change outside the declared
surface (`repo-profile.json`'s `surfaceGlobs`), skips this step entirely and goes straight to
hand-off. A change the declared process file's own unchanged-artifact exemption covers also skips
straight to hand-off, on the standing approval; see the rare case below.

When a Pre-review step is declared and the change is on its surface, settle the artifact live
against the owner before hand-off, before issue review, and before an implementer is ever spawned
for the declared surface. Follow the declared process file for its own edit-scope, approval,
exemption, and hand-off rules; this packet does not restate them. While the owner has not yet
approved, edit only the paths named in `surfaceGlobs`; routes, services, and non-surface logic are
not written during this step.

Only once the declared process reports approval does hand-off run, then issue drafting transcribe
the now-settled criteria, and implementation proceed on the remaining work, per
`standards/issue-standards.md` for how an approved pre-review result becomes an acceptance
criterion.

Rare case: a change carried by the declared process's unchanged-artifact exemption reaches no fresh
approval and proceeds on the standing one instead. See
`standards/pipeline/edge/unchanged-artifact-exemption.md` for that exemption.
