# 02-sync

Pull the parent governance before anything else touches a file: `tools/governance-sync.ps1`. It opens a small PR that merges itself on green CI. Do not wait for it. Carry on with the rules already in the tree.

- Nothing to sync, or already in sync: carry on. This repo is the governance home when `governanceHome` in `repo-profile.json` says `self`.
- A sync PR opened, or one is already open: carry on.
- It fails: say so in the session and carry on. The next run closes the gap.
- A line starting `structure change:`: note the child issue it names, put it in the report (step 12), and carry on.

How the sync works, and what it cannot force: `standards/governance-sync.md`.
