# 02: Sync

Pull governance updates from the parent repo before any other step touches a file:
`powershell -File tools/governance-sync.ps1`. Continue the build on the governance already in the
tree regardless of what it reports; a merged sync lands on a later run, not this one.

Read the outcome and act on it:

- **Governance home, or `governanceHome` not declared:** nothing to sync. Continue.
- **In sync:** nothing to do. Continue.
- **A sync PR opened, or one is already open:** the tool arms it for auto-merge once the child's
  declared CI guard is confirmed required on the default branch. Do not wait for that merge.
  Continue.
- **Non-zero exit (a sync outage):** report the failure in the session and continue the build on
  the governance already in the tree. An outage never bricks a build; the next successful sync
  closes the gap.
- **A line starting with the literal prefix `structure change:`:** report the named child issue in
  the session and carry it into the end-of-run report. A structure change opens no PR (`structure
change: no sync PR`) or ships only what was not withheld (`structure change: partial withhold`),
  with every withheld path named in that child issue rather than in a PR body. Continue the build
  on the governance already in the tree either way.

`standards/governance-sync.md` is the one place to read for the deep mechanics behind any of these
outcomes: merge-on-green, the standing-issue rule, and what counts as a structure change.
