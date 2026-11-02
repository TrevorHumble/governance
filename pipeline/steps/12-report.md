# 12-report

When the run ends, whether it shipped, parked, or stopped, write one report with `pipeline/report-template.md`.

Gather first:

- Your decision lines, except `Owner's call:` lines. Copy them in as written.
- Notes from the issue's `## Notes` only, and only those the reviewer's ruling (step 09) kept, except the served-model note below. A note with no ruling: ask the reviewer again, or start one on the `code-reviewer` seat with `reviewing-prs` if none ran. A note ruled fixable is yours to fix, not the owner's.
- The served-model check: `npm run check:served -- <session dir>`, the folder that holds `subagents/`. A mismatch goes under "For you", so the owner can update `seats.json`. An untagged spawn is an orchestrator tagging defect: write it under the issue's `## Notes` and pass it on with no ruling, since it is found after review. It is not a `seats.json` change.
- Anything only the owner can decide, including each `Owner's call:` line. It goes under "For you", priced.

What you may file on your own: `pipeline/report-template.md` § "Nothing on your own initiative".
