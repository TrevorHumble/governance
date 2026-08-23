# Adversarial Review Protocol

**Scope:** all artifacts in this repo: issues, PRs, skills, agents, and docs.
**Who runs this:** the orchestrator spawns reviewers. The product owner is not in the loop.

This protocol reflects a lean, always-on review practice: no proof-layer bureaucracy (evidence
artifacts, verdict capture, a severity adjudicator, reviewer panels, a system-level two-reviewer
bar) sits between an artifact and its review. See the governance repo's `DESIGN.md` § "Lean
review process rationale" for the rationale recorded there.

---

## Stance

**assume total failure.** Every artifact enters review as broken. Every individual
piece is broken until proven otherwise. Owe the work nothing.

- Trust nothing the artifact claims about itself. Every "this is enforced / done /
  passing" is false until verified against ground truth.
- When you catch yourself inferring "this probably works," stop and verify.
- Be hostile, skeptical, a "little asshole." Spend energy on what's wrong.

**Carve-out: the owner's approved words are not an artifact under review.** An issue's title, user
story, and acceptance criteria, once the owner has approved them per
`standards/issue-standards.md` § "Owner hand-off", are read as a whole for their meaning and
intent, not attacked. The hostile default above and the ownership rule in that section do not
contradict each other: this stance governs the plan, the dependency map, and every other artifact
in this protocol's scope; it does not reach back into words the owner has already settled.

---

## De-bias the setup

The spawner's instructions can bias the reviewer as badly as a soft prompt.

**Give the goal, not the implementation.** State the objective the artifact is judged
against. Do not name the mechanisms ("it uses X loop, a Y gate"): that pre-confirms
their existence and steers review only toward them.

**No positive hints.** Never say "the one thing we got right is...." The reviewer
enters assuming everything is bad and discovers what survives.

**Plant no suspicions.** "Suspect X is broken" biases toward confirming the guess and
away from problems you didn't anticipate. Say "assume failure, look hard."

**Give full scope.** Omission hides weak spots. List every artifact. "Anything not
listed is itself a finding."

**Sanctioned briefing fields.** The fields a briefing may carry that are never by themselves a
bias finding are the single Objective line (defined in § "Spawning a reviewer") and a
well-formed overage declaration (a measured number plus its atomic reason, defined in §
"Review-size bound"). This list is owned here; a reviewer judges a briefing's other content
against this section's rules as before.

This is a spawning discipline the orchestrator follows on every briefing: no evidence
artifact is recorded for it, though it is now checked, concurrently with every
code-review round, by the briefing audit described in § "Spawning a reviewer" -
Briefing audit. A reviewer who notices a biased briefing says so in its findings like
any other defect.

---

## Calibration: adversarial is not fabrication

Maximum suspicion without a truth-guard produces confident garbage.

- Every finding cites real evidence (`file:line`, command output, issue/PR number).
- Every best-practice claim cites a real, current source (full `https://` URL + date).
- If something survives genuine attack, record "survived, here's the proof." Enter
  assuming it won't.
- **Retract your own over-flags.** A false positive left standing is itself a failure.
  Unsupported praise and unsupported criticism are equally worthless.

**Finding-quality bar.** Every blocker or major finding states a **concrete failure scenario**: a specific input or state, and the specific wrong outcome it produces. A blocker/major that names no failure scenario is downgraded to minor/nit until its author supplies one. **Precedence carve-out:** a finding that matches a named red flag in `standards/design-philosophy.md` (cited with the pattern name and quoted evidence, per that standard) is never downgraded below major: the pattern match is its failure scenario; that standard's never-downgrade rule governs, except for the rows that standard marks exempt (see § "Right-sizing: should this be here, what does it cost, is this the smallest shape" below). Symmetrically, a PASS is not a bare token: it cites evidence per checklist item (the check performed and what it showed).

Worked example (a real finding): "The example plan step cites a file path that does not exist in this repo: an issue author copying the pattern sends the implementer to a phantom file." Scenario stated: who acts on it, and what goes wrong.

Counter-example (unfalsifiable, does not survive the bar): "This section could be confusing to some readers." No input, no actor, no wrong outcome: downgrade until evidenced.

Assume-bad stance plus no-fabrication guard together produce true positives.

**Citations must be in range.** Before citing any `file:line`, open the file and confirm
the line number is within its actual line count. Do not emit a `file:line` you have not
verified is in range: an out-of-range or unverified citation is itself a defect, not a
minor slip. This is the reviewer's own pre-emission self-check; the orchestrator's "The
spawner must never" #5 below is the reader-side check on receipt. Neither half
substitutes for the other. Both halves are judgment calls made by the people running the
review, not a mechanized gate: there is no tooling that rejects an out-of-range citation
before a verdict is recorded.

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
duty `agents/orchestrator.md` § "How to write the report" places on the orchestrator. If the look
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
  precedence carve-out in § "Calibration: adversarial is not fabrication" above. It states a
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

## Independence

Fresh context, different identity/mandate than whoever produced the work. The agent
that produced an artifact must not also write its own passing verdict.

For high-stakes or security-flagged changes the orchestrator may spawn more than one
independent reviewer at its discretion, but the standing rule for every artifact class is
**one reviewer** (plus the design-philosophy reviewer for code, and the architecture lens
when its trigger applies; see `## Reviewer count by artifact`). There is no standing
panel requirement and no fixed reviewer count that scales with risk tier; judgment about
whether a change warrants a second opinion belongs
to the orchestrator, exercised sparingly, not to a mechanical rule.

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
- **Code, rounds 2+** -> see `## One-round stop rule` below: a re-check fires only for a
  blocker/major finding, and is scoped to the fix, with **1 fresh reviewer**.
- **Security lens** (`agents/reviewer-security.md`) -> a single advisory lens, dispatched
  per `## Which reviews does this change need?` below. A major/blocker finding from it
  takes the standard one-round stop rule like any other finding: there is no separate
  reviewer-count escalation.
- **Briefing-audit lens** (`agents/reviewer-briefing.md`) -> a single advisory lens,
  dispatched concurrent with every code-review round (round 1 and every rounds-2+ scoped
  re-check). Mechanics (the machine-generated scope it audits, its dispatch inputs, and
  the round-validity consequence of a scope mismatch): § "Spawning a reviewer" -
  Briefing audit, below. Status of its judgment findings: § "Advisory-lens lifecycle"
  below.
- **Architecture lens** (`agents/reviewer-architecture.md`) -> runs alongside the code,
  round-1 reviewers (above) at PR-review time whenever the change adds a new component
  (new service, route, agent, skill, standard, command, or tool) or makes a significant structural change,
  no owner request needed. A blocker/major finding from it takes the standard one-round
  stop rule, the same cadence as the design-philosophy gate. This promotion to gating is an
  owner decision, recorded in `DESIGN.md`, per § "Advisory-lens lifecycle" below: the owner
  approved restoring the lens as an automatic gate rather than requiring a
  further advisory trial. It is also invocable on
  request as an additional entry point (e.g. for an opinion on an issue before
  implementation, or a change that does not meet the automatic trigger); a finding raised
  that way, outside the automatic PR-review dispatch, is advisory and is fixed, dropped,
  or deferred like any other finding.

Reviewer model tiers, the `sonnet-only` exception included, are set in
`agents/orchestrator.md` § "Model policy"; the independence rule behind them (a
different, non-weaker model than the implementer) is `standards/agent-standards.md`'s.

---

## One-round stop rule

Round 1 of code review runs the PR reviewer and the design-philosophy reviewer together
(`## Reviewer count by artifact`). What happens next depends on what they found:

- **Minor and nit findings are fixed inline by the implementer and shipped with no
  re-review.** They do not block the merge and do not need a second look once addressed.
- **A blocker or major finding triggers exactly one re-check**, scoped to that fix: the
  implementer fixes it, and one fresh reviewer confirms the fix, not a full re-review of
  the whole artifact again.
- There is no severity adjudicator, no contest/concede fork, no round-count soft cap, and
  no reviewer panel. A PASS with an open blocker or major finding is never a PASS.

This is a deliberately lean process: no multi-round soft-cap-and-severity-gate machinery
sits behind it (see the governance repo's `DESIGN.md` § "Lean review process rationale").

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
the briefing. This does not relax § "The spawner must never" item 5, cited here, not restated.

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
exactly like any other finding under `## Finding disposition` below. Promotion to gating,
or removal, is an owner decision made on the recorded evidence after a trial of roughly 10
PRs.

A scope-mismatch report from the briefing-audit lens (§ "Spawning a reviewer" - Briefing
audit) is a round-validity condition under that section, not a lens finding, and sits
outside this lifecycle's cannot-block rule; that rule continues to govern the briefing
audit's judgment findings (any violation of § "De-bias the setup" or § "The spawner must
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

## research-first

Before judging, the reviewer establishes the _current_ best-practice yardstick for
the area (with dated citations). Grading against stale priors is a calibration
failure.

---

## No human in the loop

The product owner does not resolve findings. Translate any "owner reviews/approves"
control into a deterministic check or an independent adversary. Reserve human judgment
for what the human can actually judge (product direction, taste).

**Findings-resolution vs. the Pre-review step.** This rule governs findings-resolution
only: the owner never adjudicates a blocker/major/minor/nit an adversarial reviewer raised,
and that stays true with no exception. It does not forbid the separately-decided
**Pre-review step** (`agents/orchestrator.md` § "Pre-review step"): a product-taste
loop, live and pre-implementation, for a repo's declared pre-review surface only, when one is
declared; full mechanics live at the process file that repo's `repo-profile.json` names, if any.
Only after the owner approves is that surface's acceptance criteria written and the normal
pipeline (issue review, implementation, PR review) runs. The loop carries no review finding to
the owner and resolves no defect; it is exactly the "product direction, taste" carve-out this
section already reserves for human judgment, made into an explicit step. A second sanctioned
owner-decision point exists for a governance-sync PR: `standards/governance-sync.md`'s "multiple
ways to fix: stop and ask the owner" escalation is cross-repo legislation, an upstream owner
control outside this section's findings-resolution rule, for the same reason the Pre-review step
above is not one. A third sanctioned owner-decision point is the end-of-run report defined in
`agents/orchestrator.md` § "No agent files its own issue". It decides, for example, whether an
already-disposed, genuinely separable item under disposition 3 graduates from a report note to a
new board row, and, for a held dependency PR under
`agents/orchestrator/dependabot-pr-path.md`'s `review` classification, whether it merges. It never
resolves a finding's severity or verdict, and it does not touch disposition 1 or disposition 2
above. A fourth sanctioned owner-decision point is the owner hand-off,
`standards/issue-standards.md` § "Owner hand-off": product direction settled before an issue even
exists, it carries no reviewer finding to the owner, and it resolves no defect, so it sits outside
this section's findings-resolution rule, the same way the Pre-review step above does.

Separately, that same PR type (a machine-generated pull of content already
reviewed in the governance home, identified by its `syncIssue` reference) takes the
contradiction review `standards/governance-sync.md` defines in place of this protocol's
reviewer-count and review-size rules below.

---

## Output discipline

- Review item-by-item. Do not ingest everything and emit one blob.
- Number each defect. Assign a severity (blocker / major / minor / nit).
- For each gap give a concrete, copy-pasteable fix.
- Final verdict: **PASS/FAIL**, one token, no hedging. Attach the numbered defect
  list. A PASS with open blockers or majors is not a PASS.

---

## The spawner must never

1. Tell the reviewer which specific parts are suspected weak: that leads the witness.
2. Include positive framing, praise, or "we tried hard on X" in the briefing.
3. Give the reviewer a curated subset of artifacts: full scope or it's not a review.
4. Allow the producing agent to review its own output, even as a secondary reviewer.
5. Accept a PASS verdict without the orchestrator first completing a required
   verification step: confirm every cited URL resolves, every `file:line` reference
   exists at that location, and every item in scope has an explicit finding. This
   check is the orchestrator's responsibility and is not delegated to the reviewer.
   This post-hoc check is the second half of the citation guarantee; the reviewer's
   own pre-emission self-check (see "Citations must be in range" under Calibration
   above) is the first half: the two do not replace one another.

---

## Reviewers are read-only

Reviewers perform read-only inspection only. Read-only commands (`git show`, `git diff`, `git check-ignore`, `git ls-files`, and this repo's own declared check commands, per `repo-profile.json`'s `checkCommands` field) are permitted. A reviewer must not run `git add`, `git reset`, `git restore`, `git checkout`, `git stash`, `git commit`, or `git rm`, and must not edit any file, even if the tools available to it would allow it.

**Rationale.** A reviewer that mutates git or files can invalidate the very work it is judging without anyone noticing (a real incident, the wedding-scavenger-hunt repo's issue tracker records one: a PR reviewer ran `git restore`, unstaged a fix, and then failed the tree it had just altered). `agents/reviewer-*.md` declare `tools: [Read]` (or a narrow read-only set), but a reviewer instantiated with a broader tool set must still be bound by this rule in prose, not by tool-list omission alone.

`agents/reviewer-briefing.md` alone is additionally permitted `git -C <repo path>
write-tree`; the `git diff --cached --name-status` and `git diff --cached --shortstat` forms it
runs, each optionally scoped to a round-1 base oid, are already covered by the base grant's
`git diff` entry above. It
does not modify working files or HEAD: it only serializes the current index into the
object store, though it may refresh the index's cache-tree under the index lock.

---

## Spawning a reviewer

**Machine-generated scope.** For a code review, the briefing's file list comes from the
round's named git command, run against the round's declared scope, and is pasted verbatim:
round 1 is `git diff --cached --name-status`, the staged change against HEAD, with the
round bound to the `git write-tree` oid; a rounds-2+ scoped re-check per § "One-round stop
rule" is `git diff --cached --name-status <round-1 bound tree oid>`, the fix's diff
relative to the round-1 tree. The orchestrator never hand-curates this list: it does not
add to, trim, or reword what the command produced. A non-code-review artifact (an issue
draft) lists that one file instead: this rule governs a code review's file list, not
every artifact class.

**Spawn-prompt skeleton.** Assemble every reviewer spawn prompt from this skeleton: static content
first (see the ordering note below), volatile artifact last, framed exactly per § "De-bias the
setup" above (goal only, never the mechanisms; no positive hints; no planted suspicions; full
scope).

```text
You are the reviewer agent defined in <path to agents/reviewer-*.md>. Read that
file first and follow it exactly, including its read-only rules.

Standard(s) to judge against: <path to standards/*.md>
Protocol: standards/adversarial-review-protocol.md
Objective: <one-line goal the artifact is judged against, per § "De-bias the setup" -
the goal only, never the mechanisms>
Overage declaration (optional; state only when this round's measured size exceeds §
"Review-size bound"): <measured number> lines under review, atomic reason: <the atomic reason>

Artifact(s) under review (complete list, anything missing from the artifact
itself is a finding):
- <path to artifact>, or, for a code review: tree oid <oid> plus this round's file
  list, the round's named git command's output (§ "Spawning a reviewer" -
  Machine-generated scope, above) pasted verbatim

Return your verdict in the output format your agent definition specifies
(verdict token plus numbered defect list with severity and file:line evidence).
```

**No mutation authority.** Spawn every reviewer with no mutation authority: use a read-only agent
type, or, if the reviewer's own spec grants a broader tool set, add an explicit no-mutation
instruction to the spawn prompt. The read-only rules themselves are owned by § "Reviewers are
read-only" above, cited here, not restated.

**Minimum context.** Owned by `standards/agent-standards.md` § "Model tier and reviewer bias";
cited here, not restated, except that the briefing fields sanctioned by § "De-bias the setup" are
the sanctioned exception.

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
two-full-rounds impasse condition is a different trigger and is never cited for this
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
findings (any violation of § "De-bias the setup" or § "The spawner must never", other
than scope, or a violation of § "Review-size bound"'s briefing duties: an overage undeclared
when the measure requires one, a declared number the auditor's own shortstat contradicts, or a
declaration present though the measure is within the bound) are
advisory per § "Advisory-lens lifecycle" and disposed per § "Finding
disposition", exactly like any other advisory lens's findings.

**Static-content-first ordering.** Place the static standard(s) and protocol first in every spawn
prompt, and the volatile artifact (the diff, the skill draft, the issue text) after it. This
ordering only matters for prompt caching, which activates only above a model-dependent minimum
cached-prefix size; below that minimum the ordering has no effect.

---

## Wave governance: grandfathering, owner-invoked wave review, doc-currency step

Three governance mechanisms, recorded by owner decision in the governance repo's `DESIGN.md` § "Wave-governance
mechanisms: owner decisions".

**Grandfathering: a mid-wave governance change does not reach back.** A governance or process change (an edit to this protocol, an agent charter, or a standard) that merges mid-wave governs from the **next issue picked up onward**. An open sibling PR already in flight, its implementation began before the governance change merged, merges under the bar that was in force when its implementation began; it is not required to re-satisfy a bar that landed after it started, and a reviewer must not flag it as a defect for that reason alone. This is a deliberate **grandfather** clause.

One exception: a **`severity:blocker`** security gate change applies to every open sibling PR immediately, with no grandfathering, a narrower, distinct rule from a security-lens finding on the change currently under review.

**Owner-invoked whole-of-wave review, not a gate.** The whole-of-wave review (mechanism: `/post-wave-review`) is **owner-invoked**: the owner runs it by hand when a wave completes; it never runs automatically, and this protocol adds no rule making it required, automatic, or a precondition for starting the next wave. Scope: cross-PR regressions, seams between PRs that individually passed review, docs-vs-code drift, and a lived-data drill appropriate to this repo. Orchestrator-side nudge: `agents/orchestrator.md` § "Wave boundary".

**Doc-currency: implementer-side step, not a reviewer.** The `doc-currency` pipeline step defined in `agents/orchestrator.md` § "Doc-currency step" is an **implementer-side** step: it adds no reviewer, no entry to `## Reviewer count by artifact`, and no row to `## Which reviews does this change need?`. Its output is restricted to `.md` files; a non-`.md` need halts-and-reports instead of being committed. A `.md`-only (`docs-only`) contribution is covered by the single combined-tree PR-review PASS and forces no separate re-confirm round.

---

## Finding disposition: fix in place, drop, or defer

Every review finding takes exactly one of three dispositions.

**1. Fix in place: mandatory for an in-scope-fixable defect.**

A finding is _in-scope-fixable_ when both hold:

- it is a real defect, not taste (the taste test is disposition 2, below); and
- fixing it changes only the work under review, its own diff, its touched files, or a direct
  consequence of the change, and the fix is bounded: not a new feature, not a large refactor.

An in-scope-fixable defect **must** be fixed in the current change before it merges: the
`## One-round stop rule` above covers exactly this case. It may **never** be deferred to a
new GitHub issue or a `spawn_task` chip. **"I do not want another review round" is never a
valid reason to defer.** Neither is "it's trivial"; see the anti-pattern below.

**2. Drop: for taste.**

A finding that is a matter of opinion, both the implementer's and the reviewer's choices are
valid, with no functional, correctness, or comprehension impact, is dropped: not fixed, not
filed. Taste is never escalated into a new issue merely because nobody wants to argue about
it further.

**3. Defer: only for genuinely separable scope.**

A finding may be deferred only if fixing it requires genuinely separable new scope:

- a different feature than the one under review;
- a large or risky refactor that would itself need its own review cycle; or
- a pre-existing defect, and only when it also sits in code this change does not touch: both
  conditions bind together, not either alone. A defect this change itself caused fails the first
  condition no matter how untouched the file it lands in is. Reading the two conditions as
  severable, and deferring a caused defect solely because the file lay outside the diff's touched
  set, is a known failure mode; disposition 1's widening, below, is where a caused defect goes
  instead.

**A deferred finding becomes a report note**, by whatever route the noticing agent's own spec
defines for handing a note upward (for example `.claude/skills/capture-system-defect/SKILL.md`
for a machinery/process defect, or a reviewer's own noticed-defect finding for a product
defect), carried into the end-of-run report per `agents/orchestrator.md` § "No agent files its
own issue" rather than filed as a new issue on initiative; the owner decides from the report's
priced options whether it graduates to one.
"I do not want another round" is excluded as a reason here exactly as in
disposition 1 above: deferral is earned by the scope being genuinely separable, never by
review fatigue.

**Anti-pattern: "trivial" gets filed, not fixed.** The tell: a finding is labelled "trivial" or
"minor" and then routed to a new issue or a `spawn_task` chip instead of
being fixed, on the theory that something this small isn't worth another round. This is
backwards. A trivial-and-fixable finding is the _exact_ case disposition 1 requires be fixed
on the spot: the smaller the fix, the worse a whole downstream pipeline
is as its vehicle for landing it. Severity labels do not decide disposition; only
in-scope-fixable vs. genuinely-separable-scope does. "Trivial" is evidence for fix-in-place,
never for defer.

**Floor, not ceiling.** This rule sets a minimum, not a maximum. Fixing more than the
in-scope-fixable set (e.g. sweeping a related pre-existing defect in a file you are already
touching) is always allowed and encouraged. The rule only forbids fixing _less_ than the
in-scope-fixable set by punting part of it elsewhere. A defect in the work under review is in scope
by definition: fixing it completes the asked work, it is not scope-creep; only genuinely separate
work is deferred.

**Recording a widening.** Disposition 1's "its touched files, or a direct consequence of the
change" clause, above, sometimes reaches a file the issue's `Touches` list never named, e.g. a
comment or cross-reference this change's own diff just falsified. That is a widening, not a new
permission and not a looser bound: it still has to be bounded, not a new feature, not a large
refactor, exactly as disposition 1 already requires. The duty itself is not new either:
`definition-of-done.md` (repo root) § "8. Regressions you caused" already states that fixing a
break your change caused is part of finishing the change, not a new issue filed for someone else to
pick up later, and is checked at PR review; this paragraph records the mechanics and points there
rather than becoming another independent statement of the same obligation. The implementer surfaces the caused defect
through the required handoff field `agents/implementation-agent.md` defines; the orchestrator is
the actor who records the widening and dispatches the fix into the current change, not one who
edits the falsified file itself. The record lands in both places a reader of `Touches` might be,
because the two copies serve different readers: the `Touches` line of the GitHub issue body, the
canonical board record, and the `Touches` line of the local `data/wip-issues/<N>-slug.md` draft,
the copy `agents/reviewer-pr.md` is handed (`data/` is gitignored, so the draft never reaches the
PR on its own). A `Touches` line in the wedding-scavenger-hunt repo's own issue history reads
`added post-review under adversarial-review-protocol Finding disposition 1: the architecture review
found the honest-description doc must name the new blocking gate, a direct consequence of the
change`, a wording pattern worth following here too.

**Worked example: fix in place.** A reviewer finds: "this PR's diff moves a handler from one
file to another, but the comment block this same diff adds two lines above still names the old
file path: a reader following the comment lands on a file this PR deleted." The cited file's
comment is inside the PR's own touched-files set and the fix is a one-line path correction.
Disposition: fix in place. Filing it as a follow-up issue or chip would be the anti-pattern
above: a trivial, in-diff fix routed around the review instead of made in it.

**Worked example: defer.** A reviewer finds: "an unrelated module, untouched by this PR,
computes tie-breaks with a comparator that silently mis-ranks entries sharing a timestamp,
unrelated to the change under review." The defect lives in code this change never
touches, and fixing it is a separate correctness fix to a different subsystem with its own test
surface. Disposition: defer, as a report note; the owner decides from its priced options whether
it graduates into a new issue.

**Severity labels.** `severity:major` is restored to its narrow definition: crash, data-loss, or
security defects only. A feature gap, a missing edge case, or a process nit is `severity:minor` or
carries no severity label at all.
