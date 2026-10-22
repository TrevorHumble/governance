# DESIGN

Design records for this repo, newest first. Each record is a `## ` title, then a line with the date and issue (`2026-10-22, #100`), then `Decided:`, `Why:` and `Gave up:` lines. At most 150 words per record; aim for under 100. CI checks this: `npm run check:design`.

## Sonnet by default, Opus for hard work

2026-10-22, #115

Decided: Everyday runs use Sonnet 5.5. A run labeled `hard` moves the orchestrator and implementer to Opus and the reviewers to Fable. Reviews stay on Opus or above.

Why: The owner's usage ran out fast. Sonnet is close to Opus on most benchmarks at half the token price, and Haiku lost to Sonnet as implementer in #98.

Gave up: Opus everywhere. The session's own seat cannot move up mid-run, so a hard issue needs the owner to switch with `/model`.

## Reviews save evidence

2026-10-22, #118

Decided: Step 09 saves each reviewer's reply under `.review_state/`. `npm run check:evidence` accepts a PASS only if the reply echoes the current working-tree id and every cited file:line exists.

Why: A PASS must be of the current code. Before, nothing showed the reviewer saw the tree being shipped.

Gave up: The old rule of no evidence-capture artifacts. Quoted text and command output cited as evidence are not checked.

## Child repos pin a governance version

2026-10-22, #100

Decided: A child's `repo-profile.json` may set `governanceRef`, a tag or branch, and sync pulls the governance repo at that ref. With no field, sync pulls the default branch as before.

Why: At cutover the owner can put v2 on main without the children pulling it before each is moved over.

Gave up: Pinning to a commit hash, since a depth-1 clone takes a tag or branch name but not a hash. The code does not check that a pin is a tag or protected branch.

## New files staged under `_claude/` until the swap

2026-10-04, #91

Decided: The v2 branch holds the new tree beside the old one. New `.claude/` content is built under `_claude/` until the swap. CI counts the new tree's tokens.

Why: Nothing discovers `_claude/`, so the old tree keeps running while v2 grows. The count stops any one PR from pushing the total past 25,000 tokens.

Gave up: Building in place. Every v2 file waits for the cutover (#102) before it takes effect.
