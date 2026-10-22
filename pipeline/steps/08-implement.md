# 08-implement

Start the `implementer` on its seat (`.claude/agents/orchestrator.md` says how) with the passing issue and the paths of any prior art step 03 found. You do not build, however small it looks.

Its handoff has decision lines under the first line. Keep them: step 11 copies them into the PR body and step 12 into the report.

When it returns, run `npm run check:budget` before any review, so an overage is caught before anyone reviews or pushes. CI runs it again as the backstop.

If it fails, read the check's own message and follow it; it says what needs the owner's yes. Tightening your own change's new text needs no yes.
