# What it checks

Each line: what a check catches, then what it misses. CI runs the `npm` scripts below except `check:evidence` and `check:served`.

- `npm test`: a failing test, including one that fails when a path from the old tree comes back or a kept tool cites a deleted file. Misses code no test covers.
- `lint`: ESLint findings in JavaScript. Misses PowerShell and prose.
- `format:check`: Prettier drift. Misses PowerShell.
- `check:budget`: the shared markdown over 20,000 tokens, or a reviewer's reading over 6,000. Its guard fails a PR that loosens a cap or the counting (a new `notCounted` entry in `repo-profile.json`, or in `governance-manifest.json` in the parent only), unless that is its only change. Misses the owner's yes (honored, not enforced), script or CI-step edits, and pushes (no guard).
- `check:banned`: banned phrases in the tree, vendored skills and buildlog; filler words in the tree. Misses other files and commit text.
- `check:emdash`: an em dash on a line a PR adds (locally, uncommitted work too). Skips the committed range when a commit says `This reverts commit <sha>`, which an agent can type. Misses commit and PR text, plain pushes.
- `check:seats`: a bad `seats.json`; a seat's agent, skill or a profile lens that names no file in `.claude/`; a model ID in shared markdown; on a PR, whether only seat values changed. Misses the owner's yes, as above.
- `check:design`: a design record over 150 words, missing its date and issue line, `Decided:`, `Why:` or `Gave up:`, out of date order, or under a changed header; notes records over 100 words. Misses whether a record is true or worth keeping.
- `check:evidence`: a PASS whose working-tree id differs, or whose cited lines do not exist. Misses the review's judgment.
- `check:served` (step 12): a subagent served off its seat's model or effort. Misses the orchestrator's own seat.
- `commit-msg`: a commit staging a non-`.md` file with no issue named (`(#N)`, closing keyword, `issue-N` branch). Misses whether the issue was reviewed. Local; `--no-verify` skips it.
- `pre-commit`: a child staging a shared path outside a sync branch. `--no-verify` skips it; CI does not back it.
- `before-issue-create`: `gh issue create` lacking the `needs-issue-review` label or a body file opening with the owner-approved line. An agent can type that line itself. Sees only Bash.
- `spawn-check`: an `Agent` call with no role tag, a model or effort off its seat, or a reviewer in the background. Misses `claude -p` and remote sessions; allows if `seats.json` is unreadable. The tag is the agent's word.
- `session-greeting`: sets `core.hooksPath` and says if both git hooks are armed; warns on a wrong model, an effort override, a low `maxEffortLevel` or a leftover `.run_state/hard`. Misses an unreported model.
- `goal-check`, `after-edit`, `before-stop`, `reviewer-done`: add a note, never block. Nothing checks they were acted on.
- `issue-guard.yml`: labels `unverified-issue` on an issue opened without `needs-issue-review`; never blocks. Applies where `.github/workflows/issue-guard.yml` exists, since `.github/**` is not shared.
- Dependabot auto-merge: merges a Dependabot PR on green `build`. Misses whether the bump is safe.
