# Reviewer conduct

Moved from `standards/adversarial-review-protocol.md`, which keeps the dispatch rules: who
spawns reviewers, how many, and in what rounds. This file holds the rules a reviewer applies
once spawned.

**Scope:** all artifacts in this repo: issues, PRs, skills, agents, and docs.

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
in this protocol's scope; it does not reach back into words the owner has already settled. This
carve-out keys off the literal `Owner-approved: yes` line: a night-pass issue's agent-written
story and criteria carry a `Night-pass:` marker instead, per
`standards/pipeline/edge/night-pass.md`, and are never covered by this carve-out, whatever scope
the pass grants.

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
bias finding are the single Objective line (defined in
`standards/pipeline/templates/spawn-skeleton.md`), a well-formed overage declaration (a
measured number plus its atomic reason, defined in `standards/adversarial-review-protocol.md`
§ "Review-size bound"), the
notes-under-challenge field (the current issue's `## Notes` entries, each note with its
set-aside justification, defined in `standards/pipeline/templates/spawn-skeleton.md`), and the
referee's dispute payload (the reviewer's finding and evidence, the implementer's dispute and
evidence, presented without ranking or framing, plus the goals doc, the issue's user story and
acceptance criteria, and the pre-review record or its stated absence, defined in
`standards/pipeline/templates/spawn-skeleton.md` and `agents/reviewer-referee.md`). The notes
field does not lead the
witness, which is why it is sanctioned: it declares a disposition the reviewer is asked to
judge, rather than pointing at a part of the artifact suspected weak; judging deferrals is
part of every reviewer's job (§ "Finding disposition", "Challenging a deferral"). The dispute
payload is sanctioned for the same reason: it hands the referee both sides' case, not a hint
toward either one. This list is owned here; a reviewer judges a briefing's other content
against this section's rules as before.

This is a spawning discipline the orchestrator follows on every briefing: no evidence
artifact is recorded for it, though it is now checked, concurrently with every
code-review round, by the briefing audit described in
`standards/adversarial-review-protocol.md` § "Spawning a reviewer" - Briefing audit. A reviewer who notices a biased briefing says so in its findings like
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

**Finding-quality bar.** Every blocker or major finding states a **concrete failure scenario**: a specific input or state, and the specific wrong outcome it produces. A blocker/major that names no failure scenario is downgraded to minor/nit until its author supplies one. **Precedence carve-out:** a finding that matches a named red flag in `standards/design-philosophy.md` (cited with the pattern name and quoted evidence, per that standard) is never downgraded below major: the pattern match is its failure scenario; that standard's never-downgrade rule governs, except for the rows that standard marks exempt (see `standards/adversarial-review-protocol.md`
§ "Right-sizing: should this be here, what does it cost, is this the smallest shape"). Symmetrically, a PASS is not a bare token: it cites evidence per checklist item (the check performed and what it showed).

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

## Independence

Fresh context, different identity/mandate than whoever produced the work. The agent
that produced an artifact must not also write its own passing verdict.

For high-stakes or security-flagged changes the orchestrator may spawn more than one
independent reviewer at its discretion, but the standing rule for every artifact class is
**one reviewer** (plus the design-philosophy reviewer for code, and the architecture lens
when its trigger applies; see `standards/adversarial-review-protocol.md`'s
`## Reviewer count by artifact`). There is no standing
panel requirement and no fixed reviewer count that scales with risk tier; judgment about
whether a change warrants a second opinion belongs
to the orchestrator, exercised sparingly, not to a mechanical rule.

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
**Pre-review step** (`standards/pipeline/steps/04-pre-review.md`): a product-taste
loop, live and pre-implementation, for a repo's declared pre-review surface only, when one is
declared; full mechanics live at the process file that repo's `repo-profile.json` names, if any.
Only after the owner approves is that surface's acceptance criteria written and the normal
pipeline (issue review, implementation, PR review) runs, unless that process file's own
unchanged-artifact exemption carries the change, in which case the criteria are written and the
normal pipeline runs on the standing approval, with no fresh trip through the live loop
(`standards/pipeline/edge/unchanged-artifact-exemption.md` owns the exemption). The loop carries
no review finding to the owner and resolves no defect; it is exactly the "product direction, taste"
carve-out this section already reserves for human judgment, made into an explicit step. A second
sanctioned owner-decision point is the end-of-run report defined in `agents/orchestrator.md`
§ "No agent files its own issue". It decides, for example, whether an already-disposed, genuinely
separable item under disposition 3 graduates from a report note to a new board row, and, for a
held dependency PR under `agents/orchestrator/dependabot-pr-path.md`'s `review` classification,
whether it merges. It never resolves a finding's severity or verdict, and it does not touch
disposition 1 or disposition 2 above. A fourth sanctioned owner-decision point is the owner
hand-off, `standards/issue-standards.md` § "Owner hand-off": product direction settled before the
issue it governs exists, it carries no reviewer finding to the owner, and it resolves no defect,
so it sits outside this section's findings-resolution rule, the same way the Pre-review step
above does.

Separately, that same PR type (a machine-generated pull of content already reviewed in the
governance home, identified by its `syncIssue` reference) needs no findings-resolution rule from
this protocol at all. `standards/governance-sync.md` states the current rule directly
(superseded 2026-08-23, issue #15: a
content-classed sync PR used to carry a one-question contradiction review and an owner escalation
for it; both are gone, and a content-classed sync PR now merges itself on green CI with no
reviewer, so `standards/adversarial-review-protocol.md`'s reviewer-count and review-size rules
never applied to it in
the first place and there is nothing left here to carve out).

---

## Output discipline

- Review item-by-item. Do not ingest everything and emit one blob.
- Number each defect. Assign a severity (blocker / major / minor / nit).
- For each gap give a concrete, copy-pasteable fix.
- Final verdict: **PASS/FAIL**, one token, no hedging. Attach the numbered defect
  list. A PASS with open blockers or majors is not a PASS.
- **Exception: the referee.** `agents/reviewer-referee.md` returns the ruling shape its own
  charter defines (`SUSTAIN`/`OVERTURN` naming a winning side and a grounding artifact), not a
  PASS/FAIL verdict with a numbered defect list; this section governs every other reviewer.

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

## Finding disposition: fix in place, drop, or defer

Every review finding takes exactly one of three dispositions.

**1. Fix in place: mandatory for an in-scope-fixable defect.**

A finding is _in-scope-fixable_ when both hold:

- it is a real defect, not taste (the taste test is disposition 2, below); and
- fixing it changes only the work under review, its own diff, its touched files, or a direct
  consequence of the change, and the fix is bounded: not a new feature, not a large refactor.

An in-scope-fixable defect **must** be fixed in the current change before it merges:
`standards/pipeline/edge/referee-loop.md` covers exactly this case. It may **never** be deferred to a
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
  instead. And "sits in code this change does not touch" is itself narrowed by the size rule
  (`standards/issue-standards.md` § "The file claim and the size rule", the single owner of its
  branches and threshold): a pre-existing defect whose fix any of that rule's permitting branches
  covers is fixed under it rather than deferred; only a fix its branch 4 forbids (a large change
  to a file another run holds) still becomes a note through this disposition.

**Challenging a deferral.** A note and its set-aside justification ride under every reviewer of
the round (the notes-under-challenge briefing field, § "De-bias the setup"), and ruling on them
is a duty, not an option: a gating reviewer whose briefing carries the field returns one ruling
line per note, from the vocabulary owned here, `OVERRULE` (the item must be handled in this
run), `DROP` (the note's own justification states the confidence the confident-drop rule
requires, `agents/orchestrator.md` § "No agent files its own issue" rule 4, and this reviewer
agrees), or `UPHOLD` (the deferral holds; the note belongs in the report). A note is
**challenged** only when it has an explicit ruling: reviewer silence on a briefed note is not a
challenge, not an agreement to drop, and leaves the note eligible for the late-note pass. Split
rulings resolve by severity, dropping being the most consequential outcome: any `OVERRULE`
defeats every other ruling, and any `UPHOLD` defeats a `DROP`, so a note is dropped only when
every reviewer that ruled on it ruled `DROP`; the orchestrator, the audited party, never picks
between reviewers. Any
one reviewer's `OVERRULE` binds
the orchestrator the same way a blocker does, and a reviewer is expected to use this power, not
to defer politely. The overrule contests the note's classification, not the size rule itself: the
ruling routes the item back through disposition 1 or the size rule's branches, whichever the
re-checked facts support, and when those facts confirm the size rule's branch 4 (a large fix in a
file another run holds) or not-a-file-edit, the ruling resolves to wait-or-report rather than
binding, so a correctly-classified note can never wedge a run on an unsatisfiable blocker. A note
taken after the round closed is challenged by the late-note pass instead
(`agents/reviewer-notes.md`, `standards/adversarial-review-protocol.md`
§ "Reviewer count by artifact").

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
change`; the wording pattern is worth following here too, citing `reviewer-conduct.md` § "Finding
disposition" rather than `adversarial-review-protocol` for the disposition it names, since that
section now lives here.

This paragraph owns a second sanctioned record type alongside the disposition-1 widening: the
**size-rule claim**, made under `standards/issue-standards.md` § "The file claim and the size
rule" branches 2 and 3 when a run takes a free file mid-run. It lands in the same two `Touches`
lines and the same wording shape, but its stated reason cites the size rule, not a repair of a
caused defect (example: `added mid-run under issue-standards file-claim branch 2: 6-line fix in a
free file`), and a reviewer verifies it against that rule (the file was free, the size fits the
branch) instead of against disposition 1.

**Worked example: fix in place.** A reviewer finds: "this PR's diff moves a handler from one
file to another, but the comment block this same diff adds two lines above still names the old
file path: a reader following the comment lands on a file this PR deleted." The cited file's
comment is inside the PR's own touched-files set and the fix is a one-line path correction.
Disposition: fix in place. Filing it as a follow-up issue or chip would be the anti-pattern
above: a trivial, in-diff fix routed around the review instead of made in it.

**Worked example: defer.** A reviewer finds: "an unrelated module, untouched by this PR,
computes tie-breaks with a comparator that silently mis-ranks entries sharing a timestamp,
unrelated to the change under review." The defect lives in code this change never
touches, another run's live claim holds that module, and the fix runs well past the size rule's
threshold: its branch 4, the one case still deferred. Fixing it is a separate correctness fix to
a different subsystem with its own test surface. Disposition: defer, as a report note; the owner decides from its priced options whether
it graduates into a new issue.

**Severity labels.** `severity:major` is restored to its narrow definition: crash, data-loss, or
security defects only. A feature gap, a missing edge case, or a process nit is `severity:minor` or
carries no severity label at all.
