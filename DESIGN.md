# DESIGN

Design records for this repo, newest first. Each record is a `## ` title, then a line with the date and issue (`2026-10-22, #100`), then `Decided:`, `Why:` and `Gave up:` lines. At most 150 words per record; aim for under 100. CI checks this: `npm run check:design`.

## Agents own the technical calls

2026-10-24, #135

Decided: Models make technical calls inside the acceptance criteria, write each down in a line, and report at the end. The orchestrator never writes the deliverable. The owner keeps what users experience, workflows, taste, whether to do it, money, publishing and irreversible acts.

Why: The owner wants to stop "models coming back to me when something is clearly part of what we're working on", and asked to "inspire them to take ownership". On 2026-10-24 he cut repeated lines and "visionary feels like a lot".

Gave up: A "build it, don't ask" line, the researcher's time box, the implementer's self-check fields.

## DESIGN.md is the owner's record

2026-10-22, #123

Decided: DESIGN.md is not inherited and not counted. Each record is at most 150 words, in a fixed shape, with a header stating the rule and a CI check. The architecture reviewer gets records quoted in its briefing.

Why: The owner said it "isn't machinery, the children won't inherit", and wanted "limiting each records footprint", with the model told, since "a limit without instruction is annoying for the model". A header works because Claude Code must read a file before editing it.

Gave up: The 2,000-token cap on the whole file, and DESIGN.md as a diary.

## NORTH-STAR belongs to each repo

2026-10-22, #101

Decided: `NORTH-STAR.md` guides work on this repo only. It is not counted in the budget and not shared with children. Each child keeps its own.

Why: The owner said "the north star is for development on this repo, the other repos will have their own", and "if it isn't mark down passed to child repos we don't worry about it". Earlier he said "it's not part of the machine".

Gave up: The 700-token reserve in the budget plan. The file is still a placeholder.

## The token budget is a hard CI gate

2026-10-22, #101

Decided: CI fails over a total cap and a per-reviewer cap, both set in `repo-profile.json`, counting only markdown shared with children. A change over a cap makes room first; only the owner raises a cap, in its own PR. Hook note text counts.

Why: The approved epic story is to "read all of our governance in one sitting". The owner decided the check "stays on for good". After "we've taken out a significant amount" he lowered the caps. The figures are arbitrary, "really just to have a cap": the decision is having one, so changing a number should meet no friction.

Gave up: Counting every tracked markdown file, and the first caps of 25,000 and 10,000.

## v2 grew on a branch, then swapped in

2026-10-22, #101

Decided: v2 was built on a branch, the old tree tagged `governance-v1`. New `.claude/` content waited under `_claude/`. The swap was three PRs in order: root files, rename to `.claude/`, delete the old tree. Three retired labels are deleted.

Why: Plan reviewers found a nested copy could load mid-run. The owner chose a branch over a folder on 2026-10-01, so v1 could keep running with its children. He approved the three-PR order and agreed to delete the labels. The order keeps CI green.

Gave up: Building in place. The new rules took effect only as the swap landed.

## Sonnet by default, Opus for hard work

2026-10-22, #115

Decided: Everyday runs use Sonnet 5.5; issue and code review stay on Opus. A `hard` label (the test is in `pipeline/PIPELINE.md`, "Before step 1") moves the orchestrator and implementer to Opus, reviewers to Fable, the referee to Sonnet at high. The orchestrator judges it at the start and asks the owner to run `/model`.

Why: The owner was "hitting my limit much faster" and wanted it "significantly cheaper", with Sonnet the default about 70 percent of the time. He chose to ratchet up for hard problems, kept reviews on Opus, set three failures since two "isn't that uncommon", and wanted hard judged at the start, as issue review "is too late". Haiku lost to Sonnet (#98).

Gave up: The `cheaper-seats` award. The session's own seat cannot move mid-run.

## Reviews save evidence

2026-10-22, #118

Decided: Step 09 saves each reviewer's reply under `.review_state/`. `npm run check:evidence` accepts a PASS only if the reply echoes the current working-tree id and every cited file:line exists. `npm run check:served` compares the model that ran with its seat.

Why: A PASS must be of the current code. v1 judged this through a briefing auditor tied to a tree id; a script now checks it.

Gave up: v1's rule of no evidence-capture artifacts, and the auditor. Quoted text and command output are not checked.

## Shared CI, and Dependabot merges on green

2026-10-22, #118

Decided: A reusable `governance-ci.yml` runs the same checks in every repo, kept in step with `ci.yml` by a text test. Dependabot PRs merge on green with no reviewer, only when actor and author are both Dependabot.

Why: The approved story is that routine work should not wait on the owner. The epic names the risk: CI is the only guard.

Gave up: The Dependabot classifier. Merge on green cannot be seen working before cutover, and needs "Allow auto-merge" turned on.

## Child repos pin a governance version

2026-10-22, #100

Decided: A child's `repo-profile.json` may set `governanceRef`, a tag or branch, and sync pulls the governance repo at that ref; with none, the default branch. A strict allowlist guards the ref. It landed on main before the swap.

Why: The approved story: at cutover the owner can put v2 on main before children pull it. The owner chose tags and branches only; a depth-1 clone takes a name, not a hash. A security review added the allowlist against crafted refs.

Gave up: Pinning to a commit hash. Nothing checks that a branch pin is protected.

## Hooks nudge; only two block

2026-10-22, #99

Decided: Hooks add a short note at the right moment and do not stop the work. Only `before-issue-create` and `spawn-check` can block. Issue filing fails closed and judges REST posts, since cloud sessions reach GitHub only that way. Notes live in one file.

Why: The decision ladder gives a moment a reminder, not a block. The owner accepted losing the goal-gate block; the epic names the trade "for a friendlier tool". Spawn checks enforce `seats.json`.

Gave up: The goal and loop gates as blocks, and a read-only reviewer hook.

## Issues are features, not layers

2026-10-19, #97

Decided: An issue is a feature someone can use. Criteria are plain "Done when" sentences, each yes or no; Given/When/Then is not used. The owner states a vision and models write criteria. v2 itself stays split by layer on purpose.

Why: The owner wants user stories "that focus on features, not technical aspects and vertical slices". He named the contradiction: v2 is a refactor, so its children are layers. He dropped Given/When/Then because it is not intuitive: he uses it at work constantly and still struggles with it, and this governance will pass to other people, including through his talk.

Gave up: Given/When/Then. A reviewer must not flag a v2 child for being a layer.

## Reviews: five labels, mentor voice, read-only

2026-10-18, #95

Decided: Labels are praise, blocker, minor, nitpick and question. A minor must be fixed; a nitpick may be declined with a reason; a question must come back answered. Reviewers only Read, Grep and Glob. Specialists run once. Skills and docs get reviewers. The referee rules once.

Why: The owner wrote the voice, "Reviewers are senior mentors, not adversaries", now in `standards/reviewing.md`. He chose the labels, the extra reviewers and the single ruling. No shell, because `dontAsk` is ignored in auto mode (#93 experiment).

Gave up: The old adversarial voice, severity labels, review batching.

## Borrowed skills are tested first

2026-10-18, #93

Decided: A skill is written only enough to fix a failure seen without it. A borrowed skill stays only if it wins a blind test. Pocock's `codebase-design` was left out: a paragraph scored 14 of 20 against 15, at about 40% less cost.

Why: Two or more plan reviewers praised "run the task without the skill first". The cost came from the #93 test. By the keep rule set before the test, the skill tied at higher cost. The owner approved dropping it.

Gave up: The vendored skill. The library checks stay, with no entries.

## Models are config in one file

2026-10-18, #94

Decided: Each role's provider, exact model ID and effort live in one shared `seats.json`, with no per-repo overrides and no model names elsewhere. The orchestrator passes them on every spawn. A PR changing only seats skips review and merges on green after the owner's yes.

Why: The owner wants to "change who's in what seat easily when a new model comes out". The spawn takes only a family alias, so exact IDs are checked after the run.

Gave up: Models in `repo-profile.json` and agent files, and a provider bridge for now.

## Children move by hand, after the talk

2026-10-01, #103

Decided: Each child repo moves by one PR from the orchestrator, carrying the new tree, hook wiring, CI caller and profile fields. Children stay pinned until it merges. Sync keeps `retired` and is trimmed, not rewritten.

Why: Plan reviewers found the old sync treats the cutover as a structure change, and settings and CI never sync. The owner added this step and kept `retired`. Waiting until after the talk simplifies the machinery.

Gave up: Letting sync carry the cutover.

## Rewrite as a quarter of the words

2026-10-01, #90

Decided: Same standards in a quarter of the words, in a mentor's voice. Each rule goes down a ladder: the model would do it anyway, drop it; a moment, a hook; must never happen, a check; only then words.

Why: The approved story: "I can read all of our governance in one sitting" and agents work "in a mentor's voice". The owner cut drop #22, "anything neither of us named", so nothing leaves unless named.

Gave up: 26 listed items, among them the old voice, the claim label and the ownership map. The Gemini waiver, as the owner confirmed.
