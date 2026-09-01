# Autonomous timed run (never-stop loop)

Full mechanics for `agents/orchestrator.md` § "Autonomous timed run (never-stop loop)". Read
that section first for the load condition; this file is the one link deeper it points to, and
covers the full procedure.

- **Arm the loop-gate (mechanical, not just discipline).** At run start, write `.run_state/run.json`
  directly (create the directory if needed) with `{ end_epoch: <now + N*60>, iters: 0, churn: 0,
last_block: 0, max_iters: <a sane cap> }`, computing `end_epoch` from a real system-clock read
  (PowerShell `[int][double]::Parse((Get-Date -UFormat %s))` for epoch seconds). Writing this file arms
  the `loop-gate` Stop hook (`.claude/hooks/loop-gate.ps1`) to BLOCK any attempt to end a turn before the
  clock budget is spent, so the never-stop loop is enforced by the harness, not only by the rules
  below. It is clock-driven (releases automatically at the budget), fails open on any error, and only
  activates while a run is in progress, so it cannot trap a normal session. Emergency brake for a
  genuine must-stop: create `.run_state/STOP`, or delete `.run_state/run.json`. The rules below define
  HOW to fill the time; the gate guarantees the time is filled.
- **Self-timing, made auditable.** Record the start timestamp **by running a real system-clock command**
  (PowerShell `[int][double]::Parse((Get-Date -UFormat %s))` for epoch seconds, or `date +%s` on Unix), and
  derive every ledger line's `elapsed` the same way: read the clock fresh, then compute `elapsed = (now −
start)/60`. **Never estimate, infer, or carry-forward `elapsed` by feel**: a ledger line whose `elapsed`
  was not derived from a fresh clock read is invalid and must be discarded and re-taken. This is not
  bookkeeping hygiene: an over-estimate makes the loop hit the WRAP threshold and stop before the budget, the
  exact early-exit failure the never-stop loop exists to prevent. **At the end of every increment, emit one
  ledger line to the Live log**, form: `[HH:MM] elapsed=Xm/budget=Ym | selector→{DO <item> | CASCADE | WRAP}
| next=<item>`. Worked example: clock reads `14:52`, run started `13:30` with a 180-minute budget, item
  #142 is ready and #147 is behind it (issue numbers illustrative): `[14:52] elapsed=82m/budget=180m | selector→DO #142 | next=#147`.
  The selector result is a visible token the agent must produce before acting; a compacted
  instance verifies the loop is live by reading the last ledger line.
- **Next-action selector: never returns "stop" while a ready item remains.** The `elapsed` driving
  EVERY selector decision, above all the WRAP decision, must come from a clock read taken at that
  moment, not from the last ledger line's number. After each increment, read the clock fresh, then:
  if `elapsed ≥ budget` → WRAP; else if `elapsed ≥ budget − 15` → **do not START any new item or
  Cascade step, go straight to WRAP** (an already in-flight item may finish); else if a ready item
  exists → do it; else run the Done-Early Cascade, then re-check. **"Done early" is not a state: it
  is the trigger to generate more high-standard work,** until the Cascade's own WRAP-on-empty exit
  below ends the run; that exit, not this bullet, is what stops the loop. The "push the loop harder
  and do more" standard below governs how hard the Cascade tries.
- **Done-Early Cascade** (empty-queue branch, run in order; a step may find work, none is owed one): (a) holistic review of
  the whole against the repo's goals doc (profile `goalsDoc`); (b) revisit every parked blocker, re-verify it is real and research a
  no-human workaround; (c) deep web research for better/standard practice; (d) raise the bar to match it;
  (e) weed stale issues and reconcile the board. **The Cascade tries hard before it gives up: if
  (a)+(b) add nothing, (c) MUST run.** A concrete improvement candidate that (c) surfaces goes to
  the end-of-run report, not the board: no agent files an issue for it on its own initiative, per
  `agents/orchestrator.md` § "No agent files its own issue". Qualifies as a candidate: "the
  `<dependency>` docs recommend setting `<option>` for `<our usage pattern>`; ours lacks it: note it
  for the report, naming `<file>`" (names the change, the surface, and the source; verify the claim
  against the repo before noting it; a candidate that contradicts a recorded decision, e.g. a CodeQL
  won't-fix in `docs/security/`, does not qualify either). Does not qualify: "error handling could be
  more consistent across routes" (no file, no concrete change, no source: a theme, not a candidate).
  Research output stays within the in-license constraint (DESIGN.md governance); a "better practice"
  needing an external/paid API or SaaS is out of scope and is surfaced as a note, not adopted.
  **WRAP is the legal exit once the Cascade still returns nothing:** if (a) through (e) run in full
  and the queue is still empty, the selector re-check returns WRAP, the run's one legal exit,
  instead of cycling the Cascade again. On that WRAP, clear this run's `.run_state/run.json` (per
  the arming step above) so the loop-gate hook's existing "no active run, allow" branch releases the
  turn on its own: the hook is not taught to read queue state, it only ever watches for the file's
  absence, which this WRAP now produces directly.
- **Owner hand-off never stalls the run.** The hand-off defined in `standards/issue-standards.md`
  § "Owner hand-off" is sent for a new item the same as any other run, but the timed run does not
  wait on it. With no approval in hand, no issue is created and no implementer is spawned for that
  item's work: the drafted message is carried into the end-of-run report and the run moves on to
  independent work instead. The hand-off is never on the must-stop list above and never joins it.
- **Watch CI to green before the increment counts as done.** Each increment that reaches the default branch
  (directly, or via a merged PR, per `repo-profile.json`'s `shipMode`) is not complete until its CI run is
  watched to completion and confirmed green: same guarantee as the Commit step. The default branch is never
  knowingly left red. This is part of completing the increment, not a new run-exit: if CI goes red, fix the
  cause or revert the commit _within the run_ before the selector advances to the next item. A red default
  branch is fixed in-loop; it never stops the timed run.
- **A halt is per-segment, never a run exit.** An eight-round halt on a single _segment_
  (the loop in `standards/pipeline/edge/referee-loop.md` cannot resolve it) still halts that segment;
  during a timed run the orchestrator logs it, the halted work becomes a parked blocker (revisited in the
  Cascade), and control returns to the selector. The run still ends only at WRAP.
- **Blockers are revisited, not parked forever.** Never accept a blocker on first contact; route around it
  now, but re-verify and research a workaround in the Cascade. Pre-solved roadblocks are verified by running,
  not asserted.
- **Decide from the goals; do not punt.** The governing procedure, with worked examples, is
  `standards/decision-heuristics.md` § "Decide from the goals"; follow its numbered steps. In one line:
  if the goals, `CLAUDE.md`, or an explicit instruction settle it, or it is a technical tradeoff, decide
  and act (never ask permission to continue authorized work); when unsure whether the goals decide it,
  spawn a consultant to _derive_ the goal-aligned answer rather than handing the call to the owner.
- **Non-blocking by default, with a bounded stop-list.** The few genuinely owner-only decisions are surfaced
  as one-line non-blocking notes the owner answers in chat; they never stall the run. **The only things that MUST
  stop and surface before the budget** are: an irreversible/destructive action with no in-loop undo
  (force-push, deleting data), anything outside the in-license constraint, a security defect, or a scope
  decision that is BOTH irreversible/owner-exclusive AND not determined by the goals (not merely a technical
  choice with a tradeoff; those are the orchestrator's to make from the goals). The `fix-now` halt,
  now a halt-and-report rather than a filed issue (`.claude/skills/capture-system-defect/SKILL.md`,
  `agents/orchestrator.md` § "No agent files its own issue" rule 3), still applies.
- The standard is excellence, not the minimum: push the loop harder and do more, held to the repo's goals doc (profile `goalsDoc`).
