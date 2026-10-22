# 12-report

When the run ends, whether it shipped, parked, or stopped, write one report with `pipeline/report-template.md`.

Gather first:

- The implementer's decision lines, except `Owner's call:` lines. Copy them in as written.
- The run's deferred notes. A note reaches the owner only if a reviewer agrees it could not be fixed in the run. Step 09 asked the reviewer for a ruling line on each. A note with no ruling counts as not agreed: ask the reviewer again, or start one on the `code-reviewer` seat with `reviewing-prs` if none ran. A note the reviewer says could have been fixed goes back to the implementer, not to the owner.
- The served-model check: `npm run check:served -- <session dir>`, the folder that holds `subagents/`. Each mismatch or untagged spawn goes under "For you", so the owner can update `seats.json`.
- Anything only the owner can decide, including each `Owner's call:` line. It goes under "For you", priced.

What you may file on your own: `pipeline/report-template.md` § "Nothing on your own initiative".
