# Build Log

- 2026-08-16: repo seeded from wedding-scavenger-hunt (#1). Standards, agent definitions,
  pipeline commands, hooks and their wiring, worktree tools, and the checks that enforce them
  ported and scrubbed of wedding-domain content; every repo-specific value moved into
  `repo-profile.json`, and the shared-file set declared in `governance-manifest.json`. Evidence:
  `docs/seed-classification-2026-08-16.md` (the classification report this seed worked from) and
  `DESIGN.md` (the founding ADR and the disposition of every hazard the report flagged). PR
  number recorded here once the seed's pull request is opened.

- 2026-08-22: [HALT] #14 rule-checker (classify every planned sync file as content or structure).
  Halted at the impasse rule (`agents/orchestrator.md` § "Stop condition"): the design-philosophy
  gate FAILed three consecutive re-review rounds on one major finding, and the rule allows two. The
  work was not committed at the halt; it stood in the worktree
  `governance-issue-14-rule-checker` on branch `issue-14-rule-checker`. A halt is not an
  acceptance. **Resolved after the halt, on owner direction:** the owner reviewed the finding, kept
  the existing behavior (an unlabeled path stays structure, withheld for a human), and directed the
  single-home fix. A fourth round then returned PASS. The ship's own record is the fragment
  `buildlog/14-<PR>.md`; this entry stands as the halt's record, not as the final state.

  **The unresolved finding.** The `classesDefault` rule (what a path no `classes` key names falls
  to) must have exactly one stated home. Round 3 found it in three homes pointing at each other in
  a circle; round 4 found the map restating it under a DESIGN.md claim of single ownership; round 5
  found `DESIGN.md:215-217` restating it while `DESIGN.md:559-561`, in the same file, declares the
  rule is stated only in `standards/governance-sync.md`. `DESIGN.md:215` was named in rounds 4 and
  5 both. Each fix through round 5 moved the duplication rather than removing it; the post-halt fix
  made that schema entry a pointer stating no rule, which closed it.

  **What did pass.** The PR reviewer returned PASS on round 4, verifying all 8 acceptance criteria
  with traced input-to-output evidence, and the briefing audit returned PASS on every round with
  the round valid each time. The architecture lens passed on round 1. Checks on the halted tree,
  run by the orchestrator: `npm test` 202 passed across 12 files, `check:emdash`, `lint`, and
  `format:check` all clean.

  **Defects the run caught and fixed, recorded because they are the run's real product.** A
  case-insensitive `-eq 'content'` that would have machine-merged a mis-cased `Content` into every
  child, inverting the safety rule the issue exists to enforce. A zero-byte shipped file crashing
  the sync to exit 2 with neither a PR nor an issue. A standing structure issue that could never be
  closed once a child adopted by hand. A fix that put a `gh` call on the "nothing to sync" path,
  which would have reported a sync outage on every build of every child lacking `gh`. An
  array-valued `classes` entry slipping past `-ceq` because PowerShell filters collections rather
  than returning false.

  **Recorded widening.** `standards/ownership-map.md` was added to the issue's `Touches` line
  during review as a disposition-1 widening: this change first makes `classesDefault` operative, so
  that file's absolute "never as content" wording became false as a direct result of the diff.

  **Report notes from this run, for the owner.** (1) The design-philosophy reviewer observed that
  `standards/design-philosophy.md:42`'s module-header carve-out requires a repo to declare a
  header convention, and this repo declares none, though `tools/governance-sync-core.ps1` uses a
  `# Name -- <what>` header on all sixteen of its functions. Every round spent findings on header
  prose as a result. Options: Nothing 20%, Delete 5%, Small 65%, Big 10%. (2) Two briefing defects
  by the orchestrator, both caught by the briefing audit: the linked issue file was handed to the
  design-philosophy reviewer, which only the PR reviewer needs, and a scope note pre-supplied the
  justification for a widening rather than just disclosing it. Options: Nothing 15%, Delete 0%,
  Small 75%, Big 10%.
