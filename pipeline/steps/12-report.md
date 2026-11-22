# 12-report

When the run ends, whether it shipped, parked, or stopped, write one report with `pipeline/report-template.md`.

Gather first:

- Each `Call:` line from the run note, and anything parked over a cap. They go under "For you".
- The served-model check: `npm run check:served -- <session dir>`, the folder that holds `subagents/`. A mismatch or an untagged spawn is a pipeline defect, not an owner call: fix the spawn or tag, or note it on the issue. It stays out of the report. A `seats.json` change is the configuration lane.
- Notes stay on the issue. An ask in one still unanswered goes under "For you" as one line.
