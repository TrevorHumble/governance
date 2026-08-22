# Agent Standards

**As an agent reviewer or author, I need a single checkable standard so I can determine whether an agent passes or fails without guessing.**

---

## Single responsibility

Each agent does one thing. If the agent's description requires "and" to list its responsibilities, split it. An agent that does code review should not also write code.

---

## Least-privilege tool access

An agent gets only the tools it needs for its defined job. Specify the `tools` array in frontmatter. If a tool is not required to complete the agent's output contract, omit it.

---

## Input / output contract

Every agent must have a defined input/output contract: what it receives (file paths, strings, structured data) and what it produces (file paths, structured data, PASS/FAIL verdicts). State both in the agent's system prompt. An agent without a contract cannot be tested or replaced.

**Route home for a noticed defect.** Every agent spec's output contract must state where a defect
the agent noticed but could not fix goes: back to the orchestrator in the agent's own handoff, as a
note, per `agents/orchestrator.md` § "No agent files its own issue". No agent invents its own route
and no agent files an issue on its own initiative; the agent's job is only to hand the note
upward, never to open it as an issue. **Reviewer carve-out:** a reviewer agent needs no separate
slot for this, since a reviewer is read-only and never edits a file: its noticed defect is already
a finding in its numbered defect list, and the orchestrator disposes of that finding per
`standards/adversarial-review-protocol.md` § "Finding disposition" like any other. When the
noticed defect is instead a pre-existing instance a standard scopes out of the current diff's
findings, the design-philosophy reviewer's route home is its own `Report notes:` block, per
`agents/reviewer-design-philosophy.md` § "Input / output contract". Every other reviewer has no such block and
returns the same kind of observation as an ordinary numbered finding instead.

**Orchestrator carve-out:** the orchestrator itself has no handoff to return a note through, since
it is not spawned. When the orchestrator notices a defect it did not cause and cannot fix in
place, it appends its own note directly to `.run_state/notes.md`, per `agents/orchestrator.md` §
"No agent files its own issue" rule 2.

---

## Model tier and reviewer bias

Use the tier appropriate to the job:

| Job kind                        | Tier                                    |
| ------------------------------- | --------------------------------------- |
| Orchestration, review, judgment | Judgment tier (the strongest available) |
| Implementation, transformation  | Implementation tier                     |
| Classification, routing, triage | Light tier                              |

Which model currently fills each tier: `agents/orchestrator.md` § "Model policy".

**Tie-break for mixed jobs:** when an agent's job spans rows, tier to the **highest-judgment task** the agent performs, not its most frequent one. Example: an agent that mostly routes incoming defects (light-tier work) but also judges whether each is consequential (judgment) is a judgment-tier agent: the routing does not need the judgment tier, but the judgment call is the part that fails silently on a weaker tier.

**Reviewer independence (implementation plan step 1; rule recorded here):**
Reviewers must run on a different, non-weaker model than the implementer, on every issue by default.
A reviewer running on the same model as the implementer inherits the implementer's correlated blind
spots: the errors the author makes are the ones the reviewer misses. Current tier assignments:
`agents/orchestrator.md` § "Model policy". The cost tradeoff of a more expensive reviewer is noted
and deferred as a separate decision.

The `sonnet-only` exception: `standards/issue-standards.md` § "Sonnet tier eligibility" and
`agents/orchestrator.md` § "Model policy".

A reviewer agent's prompt must carry no task-specific bias, and this standard owns the
minimum-context rule: a reviewer's briefing carries only what the protocol's spawn-prompt skeleton
names, nothing more; any task-specific addition beyond the skeleton's own lines is bias. What counts
as spawner bias and the sanctioned briefing fields are owned by
`standards/adversarial-review-protocol.md` § "De-bias the setup" and § "Spawning a reviewer"; this
standard does not restate them.

---

## Reviewer checklist

- [ ] PASS/FAIL: Frontmatter specifies `tools` array limited to tools required for the agent's defined job.
- [ ] PASS/FAIL: System prompt states an explicit input/output contract (what comes in, what goes out).
- [ ] PASS/FAIL: `model` field is set to a tier appropriate to the job (see table above), not left as a default that may escalate silently.
- [ ] PASS/FAIL: Body contains a `## When to invoke` section with at least two bullet points.
- [ ] PASS/FAIL: No banned slop words appear in the file.
