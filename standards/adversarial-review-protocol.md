# Adversarial Review Protocol

**Scope:** all artifacts in this repo: issues, PRs, skills, agents, and docs.
**Who runs this:** the orchestrator spawns reviewers. The product owner is not in the loop.

This protocol reflects a lean, always-on review practice: no proof-layer bureaucracy (evidence
artifacts, verdict capture, a severity adjudicator, reviewer panels, a system-level two-reviewer
bar) sits between an artifact and its review. See the governance repo's `DESIGN.md` § "Lean
review process rationale" for the rationale recorded there.

Moved from this file to `standards/reviewer-conduct.md`: the rules a reviewer applies once
spawned (stance, de-bias, calibration, independence, research-first, no human in the loop,
output discipline, what the spawner must never do, read-only conduct, and finding disposition).
This file keeps the dispatch rules: who spawns reviewers, how many, and in what rounds.

**Duplicated passages, tracked here.** The `**Scope:**` line and the lean-review rationale
paragraph above both also appear, word for word, in `standards/reviewer-conduct.md`. This file is
the single owner of both: an edit to either passage lands here first, and is carried into
`standards/reviewer-conduct.md` in the same change.

---

## Right-sizing: should this be here, what does it cost, is this the smallest shape

Every review question in `standards/design-philosophy.md` asks whether a thing is built well.
These three ask whether it should be here at all, and at this size. Apply them to every artifact
in this protocol's scope, alongside the existing checks. Word the finding as a diagnosis, not a
prosecution: an oversize change usually means the problem was not understood yet, not that someone
was padding.

**Necessity.** What breaks if this is not here? Name a thing that breaks, not a thing that might:
"when X ships, Y breaks", never "someday someone might". Where it is unclear whether that evidence
exists, go and look before raising the finding, and say which you did, looked or asked, the same
duty `standards/pipeline/templates/report-template.md` places on the orchestrator. If the look
turns up no instance, drop the finding rather than raising it hedged.

**Cost of carry.** What will this cost in later bugs and follow-up work, weighed against what it
buys? State both sides in the finding, not the cost alone. Source: Martin Fowler, "Yagni",
https://martinfowler.com/bliki/Yagni.html, checked 2026-08-22, which names the four costs of a
presumptive feature: build, delay, carry, repair. A close call the reviewer cannot settle goes
where `standards/design-philosophy.md` § "Cost of carry: where a close call goes" sends it.

**Sizing.** Would a simpler shape deliver the same outcome, and does the size of this change say
the problem was understood? Name the simpler shape; a sizing finding without one is an opinion.

**What bounds these three.**

- A PASS with no findings is a valid outcome for a right-sized artifact. A reviewer that
  manufactures a finding to look busy has failed this protocol, not satisfied it.
- This lens adds a direction to attack in, never a reason to attack less. No finding reachable
  before it is unreachable after, and review does not get faster, softer, or quicker to agree.
- A finding citing `unforced complexity` or `ghost gate`, the two rows
  `standards/design-philosophy.md` § "Red flags" carries for this lens, does **not** take the
  precedence carve-out in `standards/reviewer-conduct.md`
  § "Calibration: adversarial is not fabrication". It states a
  concrete failure scenario like any other finding and is downgraded without one.
- **The YAGNI limit.** None of these three questions, and neither of those two rows, reaches work
  that makes the software easier to change. Martin Fowler, "Yagni",
  https://martinfowler.com/bliki/Yagni.html, checked 2026-08-22: the principle "only applies to
  capabilities built into the software to support a presumptive feature, it does not apply to
  effort to make the software easier to modify." A refactor, a rename, a simplification, or a test
  that buys future change is never findable under these questions or under either row. This
  protocol is the home of that limit; `standards/design-philosophy.md` points here for it rather
  than carrying its own copy.
- Worked `Flag` / `Clean` pairs for both rows, each with a `Not a finding:` over-flag guard, live
  in `standards/design-philosophy-examples.md` § "unforced complexity" and § "ghost gate". A
  reviewer whose input contract lets it open that file reads the matching pair before classifying
  a finding on either row.

---

## Reviewer count by artifact

- **Issue / plan** -> exactly **1** reviewer (`reviewer-issue`).
- **Code, round 1** -> the PR reviewer plus the design-philosophy reviewer
  (`agents/reviewer-design-philosophy.md`) always gate round 1: **both must PASS**. An
  implementation artifact is code, an agent spec, a skill, or a standard; the
  design-philosophy gate applies to every one of them, regardless of change size. A change
  that is doc-only (`.md` files that are not themselves implementation artifacts) or
  typo-only, and lands outside a rendered user-facing surface (the paths named in
  `repo-profile.json`'s `surfaceGlobs`, or user-facing copy composed in code), is not an
  implementation artifact and skips only this gate.
  **The architecture lens also gates round 1** when its trigger applies, per the
  Architecture lens bullet below: round 1's gating reviewer count is not fixed at two, it
  grows by one whenever that trigger fires, so state it by condition, not by count.
- **Code, rounds 2+** -> see `standards/pipeline/steps/09-pr-review.md`: a re-check fires only
  for a blocker/major finding, and is scoped to the fix, with **1 fresh reviewer** per round.
- **Referee** (`agents/reviewer-referee.md`) -> dispatched exactly when a blocker or major
  finding is formally disputed at round 2 or any later round
  (`standards/pipeline/edge/referee-loop.md`): **1** reviewer, a fresh instance with no context
  from any prior round. A referee dispatch is not a code-review round: it sits **outside**
  `standards/pipeline/edge/referee-loop.md`'s round counting and **outside** § "Review-size
  bound", the same way the
  late-note pass does; no briefing audit runs on it, since its input is the dispute payload,
  not a staged diff. The dispatch still re-stamps the issue's `active-<N>-*` claim label, like
  any other review-round dispatch, per `standards/issue-standards.md` § "The file claim and
  the size rule". A referee bias-check halt (`agents/reviewer-referee.md` § "Bias check") is a
  briefing invalidation: the orchestrator re-briefs and re-runs the referee once, mirroring §
  "Spawning a reviewer" - Briefing audit's recovery rule; a second halt on the same dispatch
  takes that same section's two-invalidations escalation. Unlike a new advisory lens, the
  referee enters the pipeline gating from its first dispatch rather than advisory-first: an
  owner decision, recorded in `DESIGN.md`'s 2026-08-30 decision paragraph, per §
  "Advisory-lens lifecycle" below.
- **Security lens** (`agents/reviewer-security.md`) -> a single advisory lens, dispatched
  per `## Which reviews does this change need?` below. A major/blocker finding from it
  takes the standard cadence in `standards/pipeline/steps/09-pr-review.md` like any other finding:
  there is no separate reviewer-count escalation.
- **Briefing-audit lens** (`agents/reviewer-briefing.md`) -> a single advisory lens,
  dispatched concurrent with every code-review round (round 1 and every rounds-2+ scoped
  re-check). Mechanics (the machine-generated scope it audits, its dispatch inputs, and
  the round-validity consequence of a scope mismatch): § "Spawning a reviewer" -
  Briefing audit, below. Status of its judgment findings: § "Advisory-lens lifecycle"
  below.
- **Late-note pass** (`agents/reviewer-notes.md`) -> **1** reviewer over the notes only,
  dispatched once at the end of the session's work (a wrap, a ship, or a session-ending halt
  alike), before the end-of-run report is written, whenever any note lacks an explicit per-note
  ruling from a round reviewer (`standards/reviewer-conduct.md`
  § "Finding disposition", "Challenging a deferral"; a session
  that ran zero review rounds qualifies trivially). This bullet is the trigger's one home;
  `standards/pipeline/steps/12-report.md` owns the dispatch mechanics and points here rather than
  restating the trigger. It sits **outside** `standards/pipeline/edge/referee-loop.md`'s round
  counting and **outside** § "Review-size bound": an already-long run never skips
  it for being one round too many, and its input is notes, not a staged diff, so no shortstat
  measure applies. Its rulings dispose per `standards/reviewer-conduct.md`
  § "Finding disposition", "Challenging a deferral".
- **Architecture lens** (`agents/reviewer-architecture.md`) -> runs alongside the code,
  round-1 reviewers (above) at PR-review time whenever the change adds a new component
  (new service, route, agent, skill, standard, command, or tool) or makes a significant structural change,
  no owner request needed. A blocker/major finding from it takes the standard cadence in
  `standards/pipeline/steps/09-pr-review.md`, the same cadence as the design-philosophy gate. This promotion to gating is an
  owner decision, recorded in `DESIGN.md`, per § "Advisory-lens lifecycle" below: the owner
  approved restoring the lens as an automatic gate rather than requiring a
  further advisory trial. It is also invocable on
  request as an additional entry point (e.g. for an opinion on an issue before
  implementation, or a change that does not meet the automatic trigger); a finding raised
  that way, outside the automatic PR-review dispatch, is advisory and is fixed, dropped,
  or deferred like any other finding.

Reviewer model tiers, the `sonnet-only` exception included, are set in
`standards/pipeline/templates/model-tiers.md`; the independence rule behind them (a
different, non-weaker model than the implementer) is `standards/agent-standards.md`'s.

---

## Referee and the eight-round loop

Round 1 of code review runs the PR reviewer and the design-philosophy reviewer together
(`## Reviewer count by artifact`). What happens next depends on what they found:

- The ordinary per-round cadence (minors fixed inline with no re-review; a blocker or major
  takes one scoped re-check with a fresh reviewer): `standards/pipeline/steps/09-pr-review.md`.
- There is no severity adjudicator and no reviewer panel beyond the referee
  (`standards/pipeline/edge/referee-loop.md`). A PASS with an open blocker or major finding is
  never a PASS.

The dispute fork, the eight-round ceiling, and the referee's ruling moved to
`standards/pipeline/edge/referee-loop.md`.

This is a deliberately lean process: no multi-round soft-cap-and-severity-gate machinery of
the pre-teardown shape sits behind it (see the governance repo's `DESIGN.md` § "Lean review
process rationale").

---

## Review-size bound

**Bound.** 400 lines under review per reviewed code-review round, measured as the larger of
insertions or deletions reported by the round's shortstat form: round 1 is `git diff --cached
--shortstat`, the staged change against HEAD; a rounds-2+ scoped re-check is `git diff --cached
--shortstat <round-1 bound tree oid>`, mirroring the machine-generated-scope command forms in §
"Spawning a reviewer" - Machine-generated scope. This bound does not apply to issue or plan review
rounds, whose artifacts are not staged diffs and have no shortstat measure; their size discipline
is the acceptance-criteria ceiling in `standards/issue-standards.md` § "Acceptance criteria".

**Why the larger of insertions or deletions.** `git diff --shortstat` reports one in-place
modified line as one insertion plus one deletion; summing the two would double-count a rewrite
against the cited evidence's unit, where a modified line counts once. Taking the larger value
keeps that unit. **Known limit:** the larger-of measure undercounts a round whose additions and
deletions are unrelated rather than in-place rewrites, for example a 350-line new file plus a
350-line deleted file, which measures 350 though 700 lines are under review; the orchestrator
weighs that shape toward splitting.

**Source.** The bound above rests on SmartBear's Cisco study of 2,500 reviews over 3.2M LOC, which
found defect detection collapses past roughly that many lines under review per session:
https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/, checked 2026-08-16.
Google's guidance to err small: https://google.github.io/eng-practices/review/developer/small-cls.html,
checked 2026-08-16.

**Judgment rule, not a gate.** This bound is an orchestrator judgment rule applied when scoping a
review round, not a commit or CI gate: hook minimalism is deliberate owner policy, and a hard gate
on diff size invites laundering.

**Disposition when a round's measured size exceeds the bound.** The orchestrator's first
disposition is splitting the round into sequential, separately-reviewed changes. An atomic
change, one rule or rename applied across many homes that cannot be split without breaking it,
keeps one round instead: the overage, its measured number, and its atomic reason are declared in
the briefing. This does not relax `standards/reviewer-conduct.md`
§ "The spawner must never" item 5, cited here, not restated.

---

## Review batching

Related changes sharing one stated intent MAY ship as one reviewed batch: one issue-review
pass and one PR review covering the entire batch. The PR description lists every change in
the batch, and the reviewer's verdict covers the whole batch: a PASS on a batch is a PASS
on each change in it, and a FAIL on any change is a FAIL on the batch.

A batch's combined measured size, per § "Review-size bound", must stay within the bound for one
reviewed round to cover it; a batch whose combined size exceeds the bound takes § "Review-size
bound"'s dispositions, per change.

---

## Advisory-lens lifecycle

A new reviewer lens (e.g. security) enters the pipeline as **ADVISORY**: it
runs on every change its dispatch row matches, its findings are recorded in the review, and
it **cannot block a merge** on its own: a finding from it is fixed, dropped, or deferred
exactly like any other finding under `standards/reviewer-conduct.md`'s
`## Finding disposition`. Promotion to gating,
or removal, is an owner decision made on the recorded evidence after a trial of roughly 10
PRs.

A scope-mismatch report from the briefing-audit lens (§ "Spawning a reviewer" - Briefing
audit) is a round-validity condition under that section, not a lens finding, and sits
outside this lifecycle's cannot-block rule; that rule continues to govern the briefing
audit's judgment findings (any violation of `standards/reviewer-conduct.md`
§ "De-bias the setup" or § "The spawner must
never", other than scope, or a violation of § "Review-size bound"'s briefing duties, per §
"Spawning a reviewer" - Briefing audit) exactly as it governs any other advisory lens.

---

## Which reviews does this change need?

Path-based, and additive to the base review for the change's artifact class: a lens never
replaces the PR reviewer or the design-philosophy gate.

| Change touches                                                                                                                                                       | Reviews that run                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| The governing-artifact surface (see `CLAUDE.md` § "Governing-artifact surface" for the path list)                                                                    | Normal pipeline                                                                            |
| Docs/copy only (`.md` files that are NOT implementation artifacts: an agent spec, including `agents/reviewer-*.md` charters, a skill, or a standard never qualifies) | CI + the existing doc-only exemptions; no specialist lens                                  |
| A declared Pre-review surface (`repo-profile.json`'s `surfaceGlobs`), including text-only copy edits                                                                 | Not doc-only; the base design-philosophy gate applies (see § "Reviewer count by artifact") |
| Upload/intake, auth, file-serving, admin routes                                                                                                                      | Security lens (advisory; `agents/reviewer-security.md`)                                    |
| Scoring/ranking/derived-state logic                                                                                                                                  | The duplicated-ownership self-check gets explicit reviewer attention                       |

**Note:** "Docs/copy only" above is a review-dispatch question, which lenses run, not the
acceptance-criteria question of whether an issue may use purely structural criteria. That is
a separate exemption, defined once in `standards/issue-standards.md` § "Acceptance criteria".

---

## Spawning a reviewer

**Machine-generated scope.** For a code review, the briefing's file list comes from the
round's named git command, run against the round's declared scope, and is pasted verbatim:
round 1 is `git diff --cached --name-status`, the staged change against HEAD, with the
round bound to the `git write-tree` oid; a rounds-2+ scoped
re-check per `standards/pipeline/steps/09-pr-review.md` is
`git diff --cached --name-status <round-1 bound tree oid>`, the fix's diff
relative to the round-1 tree. The orchestrator never hand-curates this list: it does not
add to, trim, or reword what the command produced. A non-code-review artifact (an issue
draft) lists that one file instead: this rule governs a code review's file list, not
every artifact class.

**Spawn-prompt skeleton.** See `standards/pipeline/templates/spawn-skeleton.md` for the exact
skeleton every reviewer spawn prompt is assembled from.

**No mutation authority.** Spawn every reviewer with no mutation authority: use a read-only agent
type, or, if the reviewer's own spec grants a broader tool set, add an explicit no-mutation
instruction to the spawn prompt. The read-only rules themselves are owned by `standards/reviewer-conduct.md`
§ "Reviewers are read-only", cited here, not restated.

**Minimum context.** Owned by `standards/agent-standards.md` § "Model tier and reviewer bias";
cited here, not restated, except that the briefing fields sanctioned by
`standards/reviewer-conduct.md` § "De-bias the setup" are the sanctioned exception.

**Re-verify the tree oid before accepting or acting on a verdict (required; no exceptions).**
Before accepting or acting on any reviewer's verdict, re-run `git write-tree` and confirm the
resulting oid still equals the oid the review was bound to at spawn time. If the oid changed, the
staged tree was mutated mid-review: the review is invalid regardless of the verdict returned and
must be redone against a freshly captured tree. Do not accept or act on a PASS or a FAIL for a
tree whose oid no longer matches.

**Briefing audit.** Concurrent with every code-review round, the orchestrator spawns
`agents/reviewer-briefing.md` with the current round's bound tree oid, the repo path,
and, for a scoped re-check, additionally the round-1 bound tree oid as the diff base,
whose presence is what selects the scoped re-check form under the auditor's own
contract and whose absence selects the round-1 form; there is no separate `declared
scope` field. The briefing input handed over is bounded to the round's code-review
dispatch: the briefing text(s) sent to the PR reviewer, the design-philosophy reviewer,
and any lens gating the same artifact (for example the architecture lens when its
trigger fires); never the auditor's own dispatch, and never a non-code-review step such
as doc-currency. The auditor self-generates the scope list under its own contract and
cross-checks the briefing against it two-directionally: a scope-mismatch report is a
path present in the auditor's self-generated list and absent from the briefing, or
present in the briefing and absent from the self-generated list, never trusting a
briefing-supplied copy as the source. A scope-mismatch report (verdict FAIL) invalidates
the round's briefing, a round-validity condition that sits alongside the tree-oid
re-verify rule above, not a lens verdict, and a round reviewer's own bias-check halt
disposes identically: the briefing is invalid. A scope-mismatch FAIL and a bias-check
halt are both a **briefing invalidation**; the orchestrator re-briefs and re-runs the
affected reviewers before accepting any verdict from that round, at most once per round
across either trigger. A second briefing invalidation on the same round, whether two
scope-mismatch FAILs, two bias-check halts, or one of each, halts the segment, logged in
`BUILDLOG.md` per `agents/orchestrator.md` § "Stop condition" (that section's own
eight-round halt is a different trigger and is never cited for this
one). An `INVALID ROUND` report is not a briefing invalidation and does not count toward
that bound. It covers three distinct triggers across the auditor's Duties 1 through 4: a
tree-oid mismatch (Duty 1), a `git write-tree` failure (Duty 1), or any other duty's git
command failing (Duties 2 through 4), each with its own remedy: for a mismatch, the
orchestrator re-captures the tree oid and re-dispatches the audit; for a write-tree
failure, the orchestrator first resolves the index state (for example a concurrent lock
or unmerged entries), then re-captures the tree oid and re-dispatches the audit; for any
other duty's command failing, the orchestrator resolves the command's failure cause, then
re-captures the tree oid and re-dispatches the audit. The auditor's verdict enters
the commit gate only through round validity: a judgment-only audit returns PASS with
findings recorded and never blocks a commit or merge on its own. The auditor's judgment
findings (any violation of `standards/reviewer-conduct.md`
§ "De-bias the setup" or § "The spawner must never", other
than scope, or a violation of § "Review-size bound"'s briefing duties: an overage undeclared
when the measure requires one, a declared number the auditor's own shortstat contradicts, or a
declaration present though the measure is within the bound) are
advisory per § "Advisory-lens lifecycle" and disposed per
`standards/reviewer-conduct.md` § "Finding disposition", exactly like any other advisory lens's findings.

**Static-content-first ordering: tested, does not work.** A 2026-09-20/21 test (issue #85) ran
three controlled same-session Sonnet spawns inside the 5-minute prompt-caching window. Two
prompts (A, C) were byte-identical; A wrote 81,533 tokens to cache, C read all 81,533 back. A
third prompt (B) shared the first 7,375 characters with A and differed only after that point; B
wrote 30,219 tokens fresh and read only 51,342, the fixed system-and-tools prefix every Sonnet
subagent in this repo already hits, not any part of the shared 7,375 characters. A cache
breakpoint exists at the end of a subagent's first message, but no boundary sits inside it: only
a byte-identical whole first message hits, which no reviewer round produces, since each
reviewer's objective and artifact list differ. There is no spawn-prompt ordering that captures a
saving from prompt caching here. This paragraph is kept, in place of an instruction, so a future
agent with the same idea finds this record before re-running the experiment.

---

## Wave governance: grandfathering, owner-invoked wave review, doc-currency step

Three governance mechanisms, recorded by owner decision in the governance repo's `DESIGN.md` § "Wave-governance
mechanisms: owner decisions".

**Grandfathering: a mid-wave governance change does not reach back.** A governance or process change (an edit to this protocol, an agent charter, or a standard) that merges mid-wave governs from the **next issue picked up onward**. An open sibling PR already in flight, its implementation began before the governance change merged, merges under the bar that was in force when its implementation began; it is not required to re-satisfy a bar that landed after it started, and a reviewer must not flag it as a defect for that reason alone. This is a deliberate **grandfather** clause.

One exception: a **`severity:blocker`** security gate change applies to every open sibling PR immediately, with no grandfathering, a narrower, distinct rule from a security-lens finding on the change currently under review.

**Owner-invoked whole-of-wave review, not a gate.** The whole-of-wave review (mechanism: `/post-wave-review`) is **owner-invoked**: the owner runs it by hand when a wave completes; it never runs automatically, and this protocol adds no rule making it required, automatic, or a precondition for starting the next wave. Scope: cross-PR regressions, seams between PRs that individually passed review, docs-vs-code drift, and a lived-data drill appropriate to this repo. Orchestrator-side nudge: `agents/orchestrator.md` § "Wave boundary".

**Doc-currency: implementer-side step, not a reviewer.** The `doc-currency` pipeline step defined in `agents/orchestrator.md` § "Doc-currency step" is an **implementer-side** step: it adds no reviewer, no entry to `## Reviewer count by artifact`, and no row to `## Which reviews does this change need?`. Its output is restricted to `.md` files; a non-`.md` need halts-and-reports instead of being committed. A `.md`-only (`docs-only`) contribution is covered by the single combined-tree PR-review PASS and forces no separate re-confirm round.

---
