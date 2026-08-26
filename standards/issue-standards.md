# Issue Standards

**As a reviewer or implementer of an issue, I need a single checkable standard so I can determine whether an issue passes or fails without guessing.**

---

## User story

Written from the end-consumer POV: the agent, human, or system that will use the produced artifact. Format: `As a [consumer], I need... so that....` If you cannot name a consumer, the issue has no purpose.

Name whoever feels it if the thing disappears. Do not name a product owner, a developer, or an AI unless the thing is genuinely built for them; when a builder is named, say why no end user further down the chain fits better.

The `so that` clause is the test that catches a story naming a fix instead of an outcome: if the `so that` names a technical mechanism rather than something the consumer feels, the story is written in the language of the fix. The wedding-scavenger-hunt repo's issue #1262 is the worked case: the outcome wanted was two agents working at once without either handing back a fake failure, and the story instead asked for tests against a throwaway repository, a fix, not that outcome. The story names the outcome, never the mechanism.

This one-line form is the story as it lives in the issue body. § "Owner hand-off" below states the three-line written form the same story takes in the message sent to the owner; the two are not competing formats.

---

## Acceptance criteria

Written as Given/When/Then criteria testable by an agent. **An acceptance criterion is a promise: when this is true, we are done.** Criteria exist to align the owner, issue reviewer, implementer, and PR reviewer around one shared picture of what "done" means, not to catch anyone. A criterion must be readable by the product owner: if the owner cannot read a criterion and know what was promised, it is not a contract. The mechanical checking is already done for free by this repo's declared check commands (`repo-profile.json`'s `checkCommands` field).

A criterion need only be answerable yes/no by a competent reviewer against real evidence: that bar does not move, but the old requirement that answering it involve no judgment is dropped. In practice, two reviewers may disagree on the same criterion, and that is accepted knowingly. The alternative is criteria shredded into dozens of greppable strings that nobody could hold in the first place.

**Write 1-6 criteria, two to four typical; 8 is the ceiling, not a target.** More criteria are not more safety; past the ceiling, nobody can hold them, and a reviewer ends up picking one, citing it, and missing the rest. Blowing the ceiling is at least major severity, except for a criterion the owner added himself, per § "Owner hand-off"'s "Count" paragraph below (the wedding-scavenger-hunt repo's issue #410 carried 34 criteria, and its review spent itself on one of them while the real question went unasked).

**A ready-tier issue's criteria must include at least one that asserts a behavioral output value** (input to expected output), so the criteria can catch a wrong implementation, except for acceptance criteria carrying `Owner-approved: yes`, per § "Owner hand-off"'s "Behavioral value" paragraph below. An issue whose criteria are all presence/structural checks cannot, since a broken implementation can satisfy every "file contains X" check.

**Documentation-only issues** (those whose `Touches` paths are all docs, `.md` or under `docs/`) are exempt from the behavioral-value requirement above and may use purely structural criteria. A structural criterion is still written about the outcome, not the implementation: the file path a criterion checks against lives in the implementation plan, not in the criterion itself. (Backlog-tier issues capture intent before implementation and need only one such criterion, answerable yes/no by a competent reviewer; see Issue tiers.)

**Readable without the code.** A criterion is written so the owner can check it without reading code, file paths, or tool names, and it states the outcome for the end user rather than the implementation detail or technical change that delivers it. § "Owner hand-off" below states the written form the owner receives; this paragraph states what makes a criterion fit for that form in the first place.

**For a declared Pre-review surface only, the approved artifact is the acceptance criterion.** Taste is discovered, not specified: nobody knows a decoration is clutter until they see it. So for work on the surface named in `repo-profile.json`'s `surfaceGlobs` that goes through the phase-1 live pre-review loop (`agents/orchestrator.md` § "Pre-review step"), the written criteria **transcribe** what the owner already approved on the seeded preview, rather than **defining** it up front the way every other criterion in this standard does. Any behavior phase 1 faked to settle the shape (for example a hard-coded count just to see the layout) becomes real, specified work in the phase-2 criteria: the faked shortcut is not shipped as-is. **This transcription rule applies only to a declared Pre-review surface.** Logic, data, and tests, everything that is not the approved artifact itself, still take spec-first, adversarial criteria written before implementation, exactly as the rest of this standard describes; a criterion that is not about how the pre-reviewed artifact looks or reads does not get to claim this exemption.

No criterion of the form "an agent can understand X": that is unfalsifiable and is a FAIL. Every AC that says "an agent can answer X" is unfalsifiable; rewrite it as a behavioral input-to-output assertion. A file path or a literal string belongs in the implementation plan, never in a criterion the owner has to read.

---

## Acceptance-criteria amendment (bounded, mid-flight)

An issue's acceptance criteria are not frozen the instant the issue passes review. They may be amended mid-flight, but only under two conditions together: **owner approval plus one reviewer** sign off on the amended text before the implementer treats it as the new contract. Neither alone is sufficient: owner approval without a reviewer skips the adversarial check this whole standard exists to force; a reviewer alone cannot authorize spending the owner's scope without the owner's own approval.

The amendment is bounded to the issue's existing footprint: it may only add work **inside files already on the issue's `Touches` list**. Put plainly, an amendment never adds a file. The `Touches` list is a hard line set at issue-review time (it is what makes concurrent waves safe, since two agents must never share a file). An amendment that needs a file outside that list is not an amendment, it is a new issue: the owner directs it off the end-of-run report, filed and reviewed on its own.

**A widening is not an amendment.** `standards/adversarial-review-protocol.md` § "Finding
disposition" disposition 1's widening adds a file outside `Touches` to repair a defect the change
itself caused. It changes no acceptance criterion and needs no owner-plus-reviewer sign-off,
unlike an amendment, which spends new scope on purpose. It also does not get the concurrency
property the `Touches` lock exists for, the same way: a widening lands after the mechanisms keyed
off the declared list have already run against the shorter list, both the by-hand in-batch
collision check at issue-review time and the `/realign` overlap report run through
`tools/check-freshness.ps1` (`.claude/commands/realign.md`), so file exclusivity for the
widened file rests on the widening being recorded, not on tooling that ran before it existed.

Example: an issue touching one service file may be amended to also validate a field's format inside that same file, with owner + reviewer sign-off. It may not be amended to also touch an unrelated admin route to add a moderation control: that is a new, separately-reviewed issue, even if the owner wants it done "at the same time."

The "never adds a file" line above has exactly two exceptions, and neither is an amendment: the
disposition-1 widening (the paragraph above), and a size-rule claim under § "The file claim and the
size rule" below, the one sanctioned way a `Touches` list grows mid-run without owner-plus-reviewer
sign-off. Both are recorded on the `Touches` line, so the list a reviewer reads is still the whole
truth.

A change to the title, the user story, or an acceptance criterion after the owner has approved it
is not this section's amendment: it re-triggers the owner hand-off's approval step instead, per §
"Owner hand-off" below. This section's `Touches` bound still binds any implementation work the
amended text creates; its owner-plus-reviewer sign-off does not apply to the owner's own approved
words.

---

## The file claim and the size rule

This section is the one home for how a run claims files and when a small fix skips the claim
entirely. Every other file that needs either rule points here: `standards/decision-heuristics.md`
§ "Scope discipline", `standards/adversarial-review-protocol.md` § "Finding disposition",
`agents/orchestrator.md` § "No agent files its own issue", `agents/reviewer-issue.md`,
`agents/reviewer-pr.md`, `agents/implementation-agent.md`,
`.claude/skills/capture-system-defect/SKILL.md`, `.claude/commands/build.md`, and
`.claude/commands/post-wave-review.md`.

Why it exists: the `Touches` lock guards a collision between two concurrent runs. When no other
run holds a file, there is no collision to guard, and the lock was turning two-line fixes into
report notes on the owner's desk (issue #45 records the case). The claim makes "is anyone using
this file?" checkable, and the size rule sets a floor below which the question does not even need
asking.

### The claim

An issue whose issue review has passed carries a GitHub label of the form
`active-<N>-YYYYMMDD-HHMM`, where `<N>` is the claiming issue's own number and the timestamp is
**UTC**, minute precision, no separators inside the date or time (example:
`active-45-20260825-2310`). The issue's `Touches` line is the set of files it claims. The issue
number is in the label name because GitHub labels are repo-level entities: without `<N>`, two runs
stamping in the same minute would share one entity, and one run's clear would strip the other's
live hold.

The orchestrator applies the label the moment issue review passes (the same moment
`needs-issue-review` is cleared), and checks the board for competing claims before implementation
starts: `gh issue list --state open --limit 100 --json number,labels,body` returns every open
issue's number, labels, and `Touches:` line in one call. A result of exactly the limit's row
count may be truncated: re-run with a higher `--limit` until the count comes back below it,
never treating a full page as complete, before treating any file as free.

### The release rule

- **Clear on ship or close.** The run deletes its own `active-<N>-*` label when the issue merges
  or closes, and when it deliberately stops without closing (a halt, an owner interruption it can
  still act on). A run that dies without warning cannot clear anything; that case is covered by
  the staleness fallback alone.
- **Staleness fallback.** A label whose timestamp is more than 36 hours old may be cleared by any
  run that finds it.
- **Clearing deletes the entity**, not just its attachment to the issue: the label is per-run and
  dead once cleared; leaving it would grow the label namespace by one corpse per run.
- **Re-stamp on events, not clocks.** A run still working keeps its hold by re-stamping at each of
  three events it actually performs: dispatching a review round, committing, and pushing. A
  re-stamp renames the entity (create the new label, attach it, delete the old, in that order), so
  one run always shows exactly one `active-<N>-*` label; if a re-stamp race leaves two visible,
  the freshest stamp is the hold. Time-based self-assessment is explicitly
  not the trigger: an agent has no reliable sense of elapsed time, so the refresh hangs off
  events.

### The size rule

A mid-run change to a file outside the acting issue's `Touches` list takes one of four branches,
decided by two questions: how big is the change, and does another run hold the file? Size is
counted as **the larger of insertions or deletions in that file**, the same unit as
`standards/adversarial-review-protocol.md` § "Review-size bound". A file is **held** when an open
issue's `Touches` line names it and that issue carries a live (non-stale, well-formed)
`active-<N>-*` label whose `<N>` matches the issue's own number; otherwise it is **free**. A
stamp more than an hour in the future is not live either: a mis-zoned local stamp must not
outlive the release promise by its skew. Paths
compare in canonical git form (forward slashes, exact case): only that form grants or receives
protection, so a `Touches` line writes paths the way `git ls-files` prints them.

1. **Ten lines or fewer, file held by another run:** permitted, with no claim and no amendment.
   The resulting merge conflict is accepted as the cost, resolved by whichever run merges later,
   with no fresh claim needed for the resolution. The change must leave a verifiable record: the
   PR body names the holding issue's number, so a reviewer can confirm the named issue's
   `Touches` line really contains the file, telling a genuine branch-1 change apart from a
   branch-2 change that skipped its required addition.
2. **Ten lines or fewer, file free:** permitted. The acting run appends the file to its own
   issue's `Touches` line (both copies: the GitHub issue body and the local draft), recorded as a
   size-rule claim per `standards/adversarial-review-protocol.md` § "Finding disposition",
   "Recording a widening". Its existing `active-<N>-*` label now covers the file for as long as
   the run continues.
3. **More than ten lines, file free:** permitted only after the same `Touches` addition and
   record as branch 2; the claim comes first, then the change.
4. **More than ten lines, file held by another run:** not permitted. The run notes the collision
   and waits for the hold to release; this is the one case the lock exists for.

**Double-claim tie-break.** The freeness check and the claim are two steps, so two runs can both
read a file as free and both claim it. On discovering a double-claim (two open issues' `Touches`
lines naming the file, both with live `active-<N>-*` labels), the claim with the later label
timestamp yields: it removes the file from its `Touches` line, re-checks freeness, and waits
under branch 4. On equal minute-granular timestamps, the higher issue number yields.

**The ownership wall is not crossed.** The claim and the size rule operate inside the wall
(`standards/ownership-map.md`), never across it: a parent-owned governance file in a child repo is
never "free", whatever its labels say, and the child's `pre-commit` hook stays the authority. A
cross-wall fix still routes through the governance home, per `standards/governance-sync.md`.

**Decision logic is mechanized.** `tools/file-claim-core.ps1` holds the label parsing, staleness,
holder, branch, and tie-break decisions; `tests/file-claim.test.js` pins them. The prose here and
that module state one rule; if they ever diverge, fixing the divergence is a defect fix, not a
rule change.

---

## The Haiku bar

The implementation plan is a clarity heuristic: it must be clear and unambiguous enough that following it would not send a weak model off the rails. It is a thought experiment about plan clarity, not a requirement to inline every fact. Current implementer/reviewer tiers: `agents/orchestrator.md` § "Model policy".

If a step says "do the thing," rewrite it. Each step names what to create, read, or write and where.

**Example plan step, before:** "2. Update the input handling to reject bad values."
**After:** "2. In the input-validation module, in the field-filter function, reject any value whose type is not a key of `ALLOWED_TYPES` by calling the callback with an error whose message names the rejected type."
The before step forces the implementer to decide which file, which mechanism, and what "bad" means; the after step decides all three.

---

## Owner hand-off

Before an issue exists, the owner receives one short message: the title, the user story, and the
acceptance criteria, in that order, and nothing else. The implementation plan, the dependency map,
the context, and the prior-art list are never part of it; they still belong in the GitHub issue
body. The message is sent **before** `gh issue create` runs. No issue is created, and no issue's
title, story, or acceptance criteria is changed, until the owner has approved. An objection
rewrites the whole message, title included, in chat, and it is re-sent; nothing is recorded until
he approves. Neither the GitHub issue nor the `data/wip-issues/<N>-slug.md` draft exists yet at
that point, so the approval carries forward: once both are created (`agents/orchestrator.md` §
"Pipeline (ordered)" step 3), the agent records `Owner-approved: yes` on its own line, immediately
after the `**Type:**` line, in the GitHub issue body and in the draft, carrying the approval given
at hand-off. The GitHub issue body's copy is the board record; the draft's copy is the one a reviewer
checks, per § "Reviewer checklist" below and `agents/reviewer-issue.md`, since that agent is handed
only the draft's file path and cannot read the GitHub issue body.

**Return path.** If the title, the user story, or any acceptance criterion changes at all after
the owner approved it, for any reason and at any point in the issue's life, before implementation
or mid-flight, the `Owner-approved: yes` line is removed from the GitHub issue body and the draft
the moment the changed text is written, so the marker never certifies text the owner has not seen.
The hand-off message is re-sent with the changed text, and the line is recorded again only once
the owner approves that re-sent message. A change confined to the implementation plan, the
dependency map, or the context does not re-trigger this. `agents/orchestrator.md` and
`.claude/commands/build.md` point at this paragraph rather than restating it; so does §
"Acceptance-criteria amendment" above for the mid-flight case.

**Written format.** The line breaks below are part of the format. The wording is a suggested
shape, not a character-exact template: "As a / I need / so that" is convenience, not doctrine
(Ron Jeffries, https://ronjeffries.com/xprog/blog/how-should-user-stories-be-written/, checked
2026-08-22).

- **Title:** one line, plain language, naming what is needed, not how it is built.
- **User story:** three lines, each on its own line:
  ```
  **As a** [persona],
  **I need** [thing],
  **so that** [outcome].
  ```
- **Acceptance criteria:** one fenced block holding one or more scenarios. Each scenario opens
  with `Scenario <n>: <short description>` on its own line, followed by `GIVEN`, `WHEN`, `THEN`
  each on its own line, with optional `AND` lines after any of them. Keywords in capitals, one
  keyword per line, a blank line between scenarios.

Filled example:

> **Title:** Every rider sees their own trip, not the whole schedule
>
> **As a** rider,
> **I need** my trip list to show only the trips I booked,
> **so that** I never wonder whose trip is whose.
>
> ```
> Scenario 1: I see my own trip
> GIVEN I have booked a trip
> WHEN I open my trip list
> THEN my trip is there
>
> Scenario 2: I do not see another rider's trip
> GIVEN another rider has booked a trip
> WHEN I open my trip list
> THEN their trip is not there
> ```

**Count.** § "Acceptance criteria" above binds what an agent writes; this section restates none of
that count. A criterion the owner adds himself is not bounded by it and is not counted against
that ceiling. The hand-off message carries every criterion the issue holds, agent-written and
owner-added alike; none is dropped.

**Behavioral value.** § "Acceptance criteria" above's requirement that a ready-tier issue include
at least one criterion asserting a behavioral output value does not apply to a criterion carrying
`Owner-approved: yes`: the owner's own approved wording is not judged against that bar, per §
"Reviewer checklist" below's Ready-tier checklist.

**Ownership.** The owner owns the title, the user story, and the acceptance criteria. The agents
own the implementation plan and the dependency map. A reviewer's findings address the plan, the
dependency map, and the tier fields. A reviewer does not reword, rewrite, or fail an approved
story or an approved acceptance criterion, and does not re-open wording the owner has already
settled. Only the owner changes them, and he changes them in chat.

**Not a gate.** No bot, hook, CI check, or script enforces any of the above. It holds by
instruction alone.

**Grandfather clause.** An issue created before this section merged is judged against the standard
as it stood, and is neither blocked nor reworked for this shape. This clause covers an issue
drafted before this section merged but picked up waves later. The in-flight-sibling case, a
sibling issue still open when a new rule lands, is already owned by
`standards/adversarial-review-protocol.md` § "Wave governance: grandfathering, owner-invoked wave
review, doc-currency step".

**No row enforces the hand-off itself.** Neither § "Reviewer checklist" below nor
`agents/reviewer-issue.md` carries a row that checks whether the hand-off happened; the hand-off is
deliberately unmechanized, and a reviewer does not fail an issue for it. `agents/reviewer-issue.md`
does carry one row from this hand-off, judging the implementation plan against the criteria the
owner approved; the rule and its tier scope are owned by § "Reviewer checklist" below's
Ready-tier checklist, not restated here.

---

## Dependency map

Every issue must include:

```
Depends on: <issue number(s) or "none">
Blocks: <issue number(s) or "none">
Touches: <file paths or artifacts modified>
```

All three fields are required. Missing a field is a FAIL.

---

## Naming

A draft's identity is its GitHub issue number, not a locally-minted one: the draft file in `data/wip-issues/` is named `<N>-slug.md`, where `N` is the number GitHub assigned when the issue was created (`gh issue create`), captured before the draft is written. The file's `N`, its `# N:` header, and any self-referential `(#N)` must all equal that GitHub issue number. No FINAL, LAST, or TRULY_FINAL.

A draft with **no** `# N:` header is a **nit** (non-blocking): GitHub's own issue title is the canonical identity, and the in-file header is a convenience, not the source of truth. A **present-but-wrong** header (`N` or a `(#N)` self-reference disagreeing with the GitHub-assigned number) is a blocking **FAIL**: a wrong number actively misdirects a reader to the wrong issue, which a missing header does not.

---

## Issue tiers

Issues are filed at one of two tiers. The tier is declared in the issue's `**Type:**` line: either `ready` or `backlog`.

### ready tier

A ready-issue must include all of the following before it can be reviewed:

- **user story**: `As a [consumer], I need... so that....`
- **Acceptance criteria**: each criterion in **Given/When/Then** form; see § "Acceptance criteria" above for what a criterion must be.
- **implementation plan**: at least three numbered steps, each naming a file path or concrete deliverable.
- **Dependency map**: `Depends on`, `Blocks`, and `Touches` all present.

The reviewer applies the full checklist to a ready-issue.

### backlog tier

A backlog-issue captures intent before implementation is possible. It requires:

- **user story**: same form as the ready tier.
- **Acceptance criteria**: at least one criterion, answerable yes/no by a competent reviewer, per § "Acceptance criteria" above.
- **`Graduate after:`** field: a **deterministic** condition the orchestrator can evaluate without human judgment (e.g., "after issue #NNNN merges"). A `Graduate after` condition that requires human approval is a FAIL. Deterministic here decides only what reaches the end-of-run report, not what reaches the board: the owner still directs the actual graduation, per § "Graduation" below.

A backlog tier omits `Blocks`/`Touches` and omits a full implementation plan. The reviewer does not fail a backlog issue for missing those fields.

### Graduation

A backlog issue is never implemented in place. When its `Graduate after` condition is met, the
orchestrator does not open the new ready-issue itself: per `agents/orchestrator.md` § "No agent
files its own issue", it carries the met condition into the end-of-run report instead. Only once
the owner directs the graduation, off that report, does the orchestrator open the new numbered
ready-issue and close the backlog issue.

---

## Sonnet tier eligibility

A ready-tier issue's implementation and review may run on Sonnet instead of the standard reviewer policy (`agents/orchestrator.md` § "Model policy"), not by a classifier script, but by a judgment the issue reviewer (`reviewer-issue`) makes once, at issue-review time, since it already reads the issue and every path in its `Touches` list. The reviewer emits exactly one of `AWARD sonnet-only` or `DENY sonnet-only` as part of its verdict, per `agents/reviewer-issue.md`.

An award requires all three gates to hold, stated once here:

- **(a) Off the governing-artifact surface, and not security-flagged or escalated**: the issue does not touch the surface named in `CLAUDE.md` § "Governing-artifact surface", and nothing about it is security-flagged or has already been escalated to Opus.
- **(b) Off any path this repo has declared critical** (see `repo-profile.json`'s `criticalPaths` field; a repo may name join/auth, payment, moderation, or export-core equivalents as its own critical paths).
- **(c) Small and reversible**: no schema or data migration.

Any borderline case, a gate the reviewer cannot confidently confirm, is a `DENY`. The award is recorded by the `sonnet-only` GitHub label, applied by the orchestrator after reading the reviewer's verdict; the reviewer itself never applies the label or edits any file.

---

## Spawn justification

No agent creates an issue during a run on its own initiative (`agents/orchestrator.md` § "No agent
files its own issue"): a candidate surfaces first as a report note. The `spawned-in-run` label and
this section apply to the issue that results when the **owner** directs an agent, off the
end-of-run report, to file one of its notes. Such an issue carries the `spawned-in-run` label and
must contain a `## Spawn justification` section in its body, with the four fields below keeping
their present meanings; the label is the machine signal that this block is required, and an issue
without the label is not subject to it.

The block has four required fields, each non-empty:

- **Spawned by**: the spawning issue `#`, PR `#`, or run identifier the finding came from (provenance).
- **Why**: the defect or gap the new work addresses (the need).
- **Why separable**: why the work is more work, not absorbed into the spawning change. The value must name one of the three defer categories `standards/adversarial-review-protocol.md` § "Finding disposition" defines. That section is the single owner of the categories' substance; this section only requires citing one of them, it does not restate them.
- **Why not solved in the spawning session:** the concrete blocker that kept the work out of the spawning change (e.g. needs an owner design decision; would exceed the change's bounded scope). A file outside the spawning change's touched files is a sufficient reason only when the defect is not one the spawning change itself caused; a defect the change caused is repaired in place under `standards/adversarial-review-protocol.md` § "Finding disposition" disposition 1, not filed as a separate issue, so "outside the touched files" alone does not justify filing when the diff caused the gap.

Example block:

```
## Spawn justification

- **Spawned by:** #\<N>
- **Why:** <the defect or gap this issue addresses>
- **Why separable:** <one of the three § "Finding disposition" defer categories>
- **Why not solved in the spawning session:** <the concrete blocker>
```

A `spawned-in-run` issue missing the block, or with any of the four fields empty, fails review; see the Reviewer checklist below.

---

## Reviewer checklist

The story and acceptance-criteria rows below, in both checklists, test **approval state, never
authorship**: an agent drafts the story and the criteria, the owner then approves the same text,
and it is the approval, not who typed it, that takes a row out of scope. A story or acceptance
criteria carrying `Owner-approved: yes` in the `data/wip-issues/<N>-slug.md` draft, per § "Owner
hand-off" above (whose GitHub issue body copy is the board record), is out of scope for these rows
regardless of who drafted the words; the absence of that line in the draft is what makes them
apply. § "Acceptance criteria" above's count ceiling is qualified the same way: a criterion the
owner added past the ceiling, per § "Owner hand-off"'s "Count" paragraph, is not a severity
finding.

### Ready-tier checklist

- [ ] PASS/FAIL - (Not applicable to an `Owner-approved: yes` story.) User story names an end-consumer (not the author) and follows `As a [consumer], I need...` form.
- [ ] PASS/FAIL - (Not applicable to `Owner-approved: yes` acceptance criteria.) Every acceptance criterion is in Given/When/Then form and is answerable yes/no by a competent reviewer, or asserts a behavioral input-to-output value.
- [ ] PASS/FAIL - (Not applicable to `Owner-approved: yes` acceptance criteria.) At least one acceptance criterion asserts a behavioral output value (input to expected output), not only presence/structural checks, except documentation-only issues, per the exemption defined in § "Acceptance criteria" above. An all-presence-check issue a wrong implementation could pass is a FAIL.
- [ ] PASS/FAIL - Every acceptance criterion has a delivering step in the implementation plan: a criterion with no step in the plan that produces it is a blocking FAIL. This row is Ready-tier only: a backlog issue has no full implementation plan by design (§ "Issue tiers" above) and is not subject to it. Where it applies, it applies regardless of whether the story or criteria carry `Owner-approved: yes`; it judges the plan, not the owner's words.
- [ ] PASS/FAIL - Implementation plan is present and contains at least three numbered steps, each naming a file path or a concrete deliverable.
- [ ] PASS/FAIL - Dependency map contains all three fields: `Depends on`, `Blocks`, `Touches`.
- [ ] PASS/FAIL - No FINAL, LAST, or TRULY_FINAL in filenames or section headers referenced by this issue.

### Backlog-tier checklist

- [ ] PASS/FAIL - (Not applicable to an `Owner-approved: yes` story.) User story is written from the consumer POV and follows `As a [consumer], I need...` form.
- [ ] PASS/FAIL - (Not applicable to `Owner-approved: yes` acceptance criteria.) At least one acceptance criterion names a testable desired outcome, answerable yes/no by a competent reviewer.
- [ ] PASS/FAIL - `Depends on` field is present.
- [ ] PASS/FAIL - `Graduate after` field is present and states a deterministic condition (not a human approval).
- [ ] PASS/FAIL - Tier is declared as `backlog` in the `**Type:**` line.

---

## In-license check (all tiers)

Free local tooling is in scope. An issue that requires an `external/paid API`, a `non-Anthropic model key`, or a `hosted third-party service` is `out of license`: return `FAIL`.

---

## Definition of Done ownership

`definition-of-done.md` (repo root) is not on the governing-artifact surface (`CLAUDE.md` § "Governing-artifact surface"), so changing it takes the routine one-reviewer bar like any other change. That placement is deliberate: the DoD needs to stay cheap to amend as the project learns what "done" actually requires.

Cheap to review is not the same as unowned. Changing `definition-of-done.md` requires **owner approval** before it merges: the owner is the one person who can add or loosen a clause that every future PR review will be judged against. This is a recorded rule, not a mechanically enforced one: on a solo-maintainer repo (`required_approving_review_count = 0`), a CODEOWNERS-style gate cannot force owner sign-off, so the check is tamper-evident, not tamper-proof, the same honest posture as the rest of this pipeline (see the governance repo's `DESIGN.md` § "Lean review process rationale").
