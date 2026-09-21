# Spawn-prompt skeleton

Moved from `standards/adversarial-review-protocol.md` § "Spawning a reviewer". Named by
`standards/pipeline/steps/07-issue-review.md` and `standards/pipeline/steps/09-pr-review.md`.

Assemble every reviewer spawn prompt from this skeleton, framed exactly per
`standards/reviewer-conduct.md` § "De-bias the setup" (goal only, never the mechanisms; no
positive hints; no planted suspicions; full scope). Content order below is not chosen for
prompt caching: `standards/adversarial-review-protocol.md` § "Spawning a reviewer" - Static-content-first ordering records why.

**Protocol line.** Name whichever protocol file(s) the target charter's own Input / output
contract names: `standards/reviewer-conduct.md` alone for most reviewers, or both
`standards/reviewer-conduct.md` and `standards/adversarial-review-protocol.md` for the reviewers
whose duties reach into the dispatch half. Read the target charter's own Input contract to know
which applies; nothing here restates or counts that list.

```text
You are the reviewer agent defined in <path to agents/reviewer-*.md>. Read that
file first and follow it exactly, including its read-only rules.

Standard(s) to judge against: <path to standards/*.md>; omit when spawning the referee, whose
grounding artifacts ride in the Dispute payload
Protocol: <the protocol file(s) named by the target charter's Input / output contract, per the
Protocol line note above>
Objective: <one-line goal the artifact is judged against, per `standards/reviewer-conduct.md`
§ "De-bias the setup" - the goal only, never the mechanisms>
Overage declaration (optional; state only when this round's measured size exceeds §
"Review-size bound"): <measured number> lines under review, atomic reason: <the atomic reason>
Notes under challenge (optional; state only when the linked issue carries `## Notes` entries):
the issue's `## Notes` entries pasted verbatim, each note's substance and its set-aside
justification, nothing added or trimmed
Dispute payload (optional; state only when spawning the referee, `agents/reviewer-referee.md`):
the reviewer's finding and evidence, the implementer's dispute and evidence, presented without
ranking or framing, plus the goals doc (the doc named by `repo-profile.json`'s `goalsDoc`
field; when that field is empty, a statement that no goals doc exists), the issue's user story
and acceptance criteria, and, when this repo declares a pre-review process, the pre-reviewed
decisions for the change; when this repo declares `preReview: "none"`, a statement that no
pre-review record exists and that this is the normal case

Artifact(s) under review (complete list, anything missing from the artifact
itself is a finding):
- <path to artifact>, or, for a code review: tree oid <oid> plus this round's file
  list, the round's named git command's output (defined in
  `standards/adversarial-review-protocol.md` § "Spawning a reviewer" - Machine-generated
  scope) pasted verbatim; omit when spawning the referee, whose
  input is the Dispute payload above

Return your verdict in the output format your agent definition specifies
(verdict token plus numbered defect list with severity and file:line evidence; a referee
returns the ruling shape its definition specifies instead).
```
