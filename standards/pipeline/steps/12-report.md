# 12: Report

Once the session's work ends, wrap, ship, or halt, first run the late-note pass when its trigger
holds (`standards/adversarial-review-protocol.md` § "Reviewer count by artifact"'s Late-note pass
bullet owns the trigger and its exemptions): dispatch `agents/reviewer-notes.md`, one instance,
tier per `standards/pipeline/templates/model-tiers.md`, over the notes only, before the report is
written. A session-ending halt runs the pass too, before
its `[HALT]` report.

Then emit the end-of-run report, once and only once per session, reading the worktree's whole
`.run_state/notes.md`. Use `standards/pipeline/templates/report-template.md` for the exact shape
and the worked example. A session-ending halt's report already travels inside its `[HALT]` entry,
so this step adds nothing there. The session's work ends when it stops working in that worktree,
not when one issue in it ships: a report already emitted is re-emitted, not skipped, for any note
taken afterward.

Rare case: what counts as a note, where it is written, the four-option report shape, confident
drops, and how an owner decline is recorded: `agents/orchestrator.md` § "No agent files its own
issue".

Rare case: in an autonomous timed run, a per-segment halt folds its report into the session's
end-of-run report, per `agents/orchestrator.md` § "Stop condition"; the timed run's own
mechanics: `standards/pipeline/edge/timed-run.md`.

Rare case: an issue rode a night pass this session; the report lists it, quoting the grant it
rode on: `standards/pipeline/edge/night-pass.md`.
