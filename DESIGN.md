# DESIGN.md: architecture decisions, rationale, tradeoffs

Per `standards/documentation-standards.md`, this file holds decisions and their rationale, not
getting-started instructions (`README.md`) or agent behavior rules (`CLAUDE.md`).

---

## ADR: seeding this repo from wedding-scavenger-hunt (2026-08-16)

**Problem.** Each of the owner's repos carried its own copy of the governance layer (standards,
agent definitions, pipeline commands, hooks, worktree tools), and the copies drifted: the
wedding-scavenger-hunt repo's governance advanced fastest (a full PR pipeline, an issue lifecycle
label set, a one-round review-stop rule, a Sonnet cost tier), while other repos fell generations
behind with no mechanism to catch up.

**Decision (owner, 2026-08-16).** Create this repo, `governance`, as the new canonical home for
the shared governance layer. Rules of the road, settled the same day and recorded in `README.md`:
global wins by default; a child overrides only by declaring it in its own local override file
(superseded 2026-08-18, issue #3: the override home is now the tracked `## Governance overrides`
heading in the child's own `CLAUDE.md`, per § "Governance sync" below and
`standards/governance-sync.md`; this sentence stays as the historical record of the seed
decision; superseded again 2026-08-23, issue #15: that tracked heading is itself deleted, not
replaced by another heading. A child keeps a retained-divergent path on purpose by declaring it
under `acknowledgedDivergentPaths` in its own `repo-profile.json` instead (§ "Merge-on-green
sync" below). A child that cannot follow a global rule at all changes the rule in the governance
home; there is no local override to declare); governance fixes land here; children pull on build.
Seed content comes from
wedding-scavenger-hunt, the gold-standard copy at the time, scrubbed of that repo's domain
content and with every repo-specific value moved into `repo-profile.json`.

**What this issue does NOT do.** Sync machinery (a child repo actually pulling from this repo)
and wedding-repo adoption (the wedding repo switching to consume this repo instead of its own
copy) are deliberately out of scope here; they are follow-up issues, filed after this repo's seed
merges. No child repo is broken by the deferral: each keeps its own working copy until sync
lands.

**Provenance.** A researcher pass classified every governance file in the wedding-scavenger-hunt
repo as GLOBAL (port near-as-is), LOCAL (stays behind), or MIXED (generic core, domain-specific
parts scrubbed), with per-file scrub lists, a cross-reference map, and a hazard list. That report
ships verbatim as `docs/seed-classification-2026-08-16.md`, the evidence record for this seed.
The wedding-scavenger-hunt repo's own `DESIGN.md` remains the archive of record for the governance
history that predates this repo (the ADRs, incident write-ups, and dated decisions the ported
standards occasionally cite by provenance note); porting that history itself is a later issue's
job, not this one's.

---

## repo-profile.json schema

Every field a shared governance file may need to read, one per line, with the allowed values any
repo may declare (not only this repo's own choice):

- `preReview` (string). Allowed: the literal `"none"`, or any other string naming this repo's
  declared pre-review process (for example a live visual-approval loop); when not `"none"`, it
  should name, in the repo's own docs, a process file describing the mechanism.
- `surfaceGlobs` (array of strings). Allowed: any list of path globs, or `[]`; the pre-review
  surface, path globs a change must touch to trigger the declared pre-review step, empty when
  `preReview` is `"none"`.
- `shipMode` (string). Allowed: `"pr"` (branch, PR, CI, merge on green) or `"direct"` (commit
  straight to the default branch, watch CI to green there, no branch or PR).
- `criticalDependencies` (array of strings). Allowed: any list of npm package names, or `[]`;
  package names whose bump is held for review regardless of semver, per
  `.claude/rules/dependencies.md`.
- `criticalPaths` (array of strings). Allowed: any list of path globs or named critical
  behaviors, or `[]`; a repo's own critical paths (join/auth, payment, moderation, export-core
  equivalents) or critical behaviors no glob can name, consumed by `standards/issue-standards.md`
  § "Sonnet tier eligibility" gate (b): an issue touching a critical path or critical behavior is
  denied the `sonnet-only` award. A mechanized consumer of this field treats a non-glob entry as
  unmatched-and-critical, never unmatched-and-safe: fail closed rather than silently ignore an
  entry it cannot pattern-match.
- `ciCheckNames` (array of strings). Allowed: any list of real, observed CI check-run names
  required on the default branch before merge, consumed by `tools/apply-branch-protection.ps1`.
- `docCurrencyPaths` (array of strings). Allowed: any list of source paths, or `[]`; paths whose
  change triggers the orchestrator's `doc-currency` step (`agents/orchestrator.md` § "Doc-currency
  step").
- `goalsDoc` (string). Allowed: a repo-relative path to this repo's own goals doc, or an empty
  string if it has none.
- `checkCommands` (object). Allowed: any object whose values are shell-runnable command strings,
  keyed by whatever names the repo's own standards cite (`"install"`, `"test"`, and `"emdash"` are
  the three this repo's own ported standards expect; a repo may declare more). `"install"` is the
  command that gets a fresh, lockfile-exact set of dependencies before the test suite runs
  (`definition-of-done.md` § "6. Clean test run" defers to this key rather than naming `npm ci`
  itself, so the clause reads correctly for a non-npm repo whose install step is something else
  entirely). For example: `{"install": "npm ci", "test": "npm test", "emdash": "npm run
check:emdash"}`.
- `ghPath` (string). Allowed: `"gh"` (on PATH) or an absolute path to the GitHub CLI binary. A
  machine where `gh` lives elsewhere records the absolute path as a per-machine note in that
  machine's own `CLAUDE.local.md`, never in this committed file, and sets the `GH_PATH`
  environment variable to match. The full gh resolution chain `tools/governance-sync.ps1` reads
  is § "Governance sync" below (the gh resolution chain paragraph), the one detailed home.
- `defaultBranch` (string). Allowed: any git branch name that exists on the remote; the branch
  `tools/check-freshness.ps1`, `tools/new-agent-worktree.ps1`, `tools/apply-branch-protection.ps1`,
  and `tools/repo-profile-core.ps1`'s callers treat as the remote default, instead of a hardcoded
  `origin/main`.
- `governanceHome` (string). Allowed: the literal `"self"` for the repo that is the governance
  home, or the URL or filesystem path of the governance home repo for a child. Absent means
  unconfigured: `tools/governance-sync.ps1` does nothing. This repo's own profile declares
  `"self"`.
- `syncIssue` (positive integer). The child's own standing GitHub issue number for governance
  syncs; required whenever `governanceHome` is not `"self"`. This repo does not declare it.
- `acknowledgedDivergentPaths` (array of strings). Allowed: any list of repo-relative paths, or
  `[]`; the retained-divergent paths (§ "Governance sync" below, "The `retired` entry schema and
  provenance-checked pruning") this child means to keep un-pruned on purpose. A path in this list
  produces no `WARNING retained divergent` line and no entry in the retained-divergent-paths
  issue `tools/governance-sync.ps1` files (issue #15); this is what replaced the retired,
  deleted `## Governance overrides` tracked-override home (§ "Merge-on-green sync" below). This
  repo does not declare it.

**`tools/repo-profile-core.ps1`.** All profile-reading PowerShell logic (resolving
`repo-profile.json`'s path by default, or reading a caller-supplied `-ProfilePath` instead, and
falling back to a named default if the field is absent) is single-homed in this file's
`Get-RepoProfileValue -Field <name> -Default <value> [-ProfilePath <file>]` function.
`-ProfilePath`'s own default is `$PSScriptRoot\..\repo-profile.json` (the repo root); a caller
that passes `-ProfilePath` explicitly reads a different profile entirely, the mechanism
`tools/governance-sync.ps1` uses to read a child's profile rather than this repo's own. Its
`$FieldDefaults` table is the single home of per-field fallbacks a caller needs no `-Default`
argument for (the `defaultBranch` fallback of `'main'` lives there, mirrored once, deliberately, in
`scripts/check-emdash.js` as the sanctioned cross-language copy noted below). Every
PowerShell tool that reads the profile (`tools/check-freshness.ps1`,
`tools/new-agent-worktree.ps1`, `tools/apply-branch-protection.ps1`,
`tools/classify-dep-pr-core.ps1`, `tools/governance-sync.ps1`) dot-sources it rather than
carrying its own copy. This file was
added during the PR-review fix round on this issue's implementation, after the review found the
same profile-reading logic duplicated across four tools with two different resolution strategies;
it widens this issue's `Touches` beyond the originally-filed set. The then-current `tools/**` glob
covered it, so no manifest change was needed at the time; issue #11 replaced that glob with an
enumerated list, so a new `tools/` file now needs its own `sharedPaths` entry.
`scripts/check-emdash.js` is the one deliberate exception: a
Node script cannot dot-source a `.ps1` file, so it keeps its own small JS reader, with a comment
naming this file as the PowerShell-side owner.

**`tests/ps-launcher.js`.** All PowerShell-launcher resolution for the test suite (probing
`powershell` then `pwsh`, the same order `.githooks/commit-msg` itself probes in, and exposing the
resolved launcher name, a `launcherMissing` boolean, and the shared skip-title text) is
single-homed in this file. It was added during the PR-review fix round on this issue's
implementation, after the review found the same probe duplicated across five suites with two
different resolution strategies, one of which (picking `powershell` on win32 and `pwsh` everywhere
else, then skipping if that one guess was absent) silently skipped whole suites on a Windows host
carrying only `pwsh`. Every suite that spawns PowerShell (`tests/apply-branch-protection.test.js`,
`tests/check-freshness.test.js`, `tests/classify-dep-pr.test.js`, `tests/governance-sync.test.js`,
`tests/commit-msg.test.js`) requires it rather than carrying its own copy.

---

## governance-manifest.json semantics

`retired` (array of `{ "path", "sha256" }` objects): tombstones for a shared path this repo used
to declare shared but no longer does. `path` is the retired file's repo-relative path; `sha256`
is the lowercase hex SHA-256 of its last-shipped content, the provenance check
`tools/governance-sync-core.ps1`'s `Get-SyncPlan` uses to decide whether a child's own copy is
safe to delete (see § "Governance sync" below). Empty at seed time (nothing has been retired
yet), so the schema change this repo's issue #3 made (from plain strings to these objects)
rewrote no existing data.

`sharedPaths` (array of glob-ish strings): exactly the governance files a child repo receives on
sync. A `path/**` entry means "everything under this directory that exists at
sync time," so a wildcard entry never goes stale as files are added or removed beneath it; a bare
path entry names one specific file, and is checked to exist by `tests/governance-manifest.test.js`.

`excludedPaths` (array of glob-ish strings): this repo's own build and record files, the mirror
image of `sharedPaths` and the manifest's single home for that exclusion set (not restated in
`tests/governance-manifest.test.js`, which reads this array rather than carrying its own copy). It
uses the same `path/**` glob syntax as `sharedPaths`, plus one addition: a `!`-prefixed entry is a
gitignore-style negation, carving a file back out of a broader exclusion that would otherwise also
cover it. This is how `buildlog/**` (the fragments, not shared) and `buildlog/README.md` (the
template, a `sharedPaths` entry) coexist without both arrays claiming the same file: `excludedPaths`
lists `"buildlog/**"` then `"!buildlog/README.md"`, so the file resolves to shared and shared only.
A child receiving a sync does NOT also receive this repo's own enforcement tooling (`tests/**`,
the vitest/prettier configs): those assert facts about this repo's own tree and would fail on
arrival in a child whose tree differs; each child keeps its own test surface, adopting its own
copy of a guard through its own pipeline if it wants one. Resolved and recorded in full in
§ "Governance sync" below.

`tests/governance-manifest.test.js` guards both directions: every declared `sharedPaths` entry
resolves to a real file (the AC5 promise), and, in the other direction, every git-tracked file in
this repo matches exactly one of `sharedPaths` or `excludedPaths`, never neither (a new governance
file landing in neither would silently never reach a child on sync) and never both (a file claimed
by both would hide a misclassification, the way `buildlog/README.md` used to be covered by a
blanket `buildlog/**` exclusion even while also declared shared, until the negation entry above
was added to keep the two sets disjoint).

**CLAUDE.md is excluded from `sharedPaths` but its `## Governing-artifact surface` section is not
optional for a child.** Every child repo must carry its own `## Governing-artifact surface`
section in its own `CLAUDE.md`, naming its own governing-artifact path list. The global CLAUDE.md
template does not reach a child through the sync itself (`CLAUDE.md` stays in `excludedPaths`,
deliberately: an unconditional overwrite would clobber a child's own local rules); instead,
`tools/governance-sync-core.ps1`'s `Get-SyncPlan` checks the child's own `CLAUDE.md` for the
literal heading and emits a warning, surfaced on every sync, until the child adds it. Resolved
and recorded in full in § "Governance sync" below.

**`DESIGN.md` is excluded from `sharedPaths`, but any `sharedPaths` file that cites one of its
sections by name creates a child-repo obligation.** There is no frozen list of which files and
sections do this: the current set is derived mechanically, not hand-enumerated, so it cannot go
stale the way a written inventory did twice across two fix rounds on this issue. The guard is
`tests/governance-manifest.test.js`'s citation-coverage test, which scans every `sharedPaths` file
for a `DESIGN.md § "Title"` (or `DESIGN.md "Title"`) citation and fails if the quoted title has no
matching `## ` heading in this file. A human can run the same check directly: `npx vitest run
tests/governance-manifest.test.js`. None of the cited sections is itself in `sharedPaths`, so every such citation is reworded to name
the governance repo explicitly (`the governance repo's DESIGN.md § "Title"`), a rewrite done once
at the source, not something the sync mechanism does at delivery: the pointer stays true wherever
the file lands because it says where the rationale lives, not because a child is assumed to carry
the section itself. `tests/governance-manifest.test.js`'s citation-prefix check enforces the
prefix on every future citation. Resolved and recorded in full in § "Governance sync" below.

A larger set of shared files mention `DESIGN.md` without naming a section (reading it wholesale
for context, or listing the path alongside `CLAUDE.md`/`README.md` in a doc-split description).
These are not section-citation promises: such references resolve to whatever `DESIGN.md` a child
carries and need no section guarantee.

**The scanner requires "DESIGN.md" immediately adjacent to the § or opening quote, not mere
co-occurrence in the same sentence.** This is what correctly leaves
`standards/adversarial-review-protocol.md`'s "owner decision, recorded in `DESIGN.md`, per §
"Advisory-lens lifecycle" below" uncited: that quoted title names a section of
`adversarial-review-protocol.md`'s own § "Advisory-lens lifecycle", not of `DESIGN.md`, and
`DESIGN.md` has no such heading.

**Ecosystem-specific shared tool.** `tools/check-deps-parity.ps1` is shared even though it is
Node-ecosystem-specific: a child repo without `package.json` is expected to have it no-op or fail
fast, not crash unrecoverably. `tools/governance-sync.ps1` treats this as acceptable, not as a
sync defect: it copies the file unconditionally, the same as any other `sharedPaths` entry, and
does not inspect its runtime behavior.

**Five ownership sidecars, added by issue #11.** `classes` (object, keyed by path):
records each `sharedPaths` entry's steady-state class, `"content"` or `"structure"`, per
`standards/ownership-map.md`'s two class-definition sentences; a narrower key not itself a
`sharedPaths` entry overrides the entry it resolves under, for a path needing a different class
than its enumerated parent. `classesDefault` (string): the fallback class for any path `classes`
does not name; the rule is stated once in `standards/governance-sync.md` § "What a sync is".
`arrivesAsStructure` (array of strings): paths whose first delivery into a
child is structural even though their steady-state class is `"content"`.
`standards/ownership-map.md`'s "Change classes" section owns both that criterion and how a
consumer applies it; this entry states the sidecar's shape and a one-line gloss of its contents.
`repoProfileFields` (array of `{name, type}` objects): one entry per
field in this file's § "repo-profile.json schema" above, parsed and compared by
`tests/governance-manifest.test.js` rather than hand-copied, so the two lists cannot drift.
`shelfRoots` (array of strings): the four shelf roots `standards/ownership-map.md` names, also
compared both ways by the same test.

**`tests/governance-manifest.test.js` parser quirks and rationale, recorded here rather than
inline.** `extractShelfRoots` keeps only backticked tokens ending in `/`: the "Standard shelves"
section also names the repo-root profile slot, `repo-profile.json`, which carries no trailing
slash and would otherwise be mistaken for a fifth shelf root. It scans the whole section, not one
line, so a later editor rewrapping the shelf sentence cannot turn the check red for no visible
reason, and it de-duplicates, since the section's prose may name a root twice (for example, a
sentence explaining that `skills/` needs no manifest entry still contains the word `skills/`).
`extractClaudeMdSectionCitations` matches a `CLAUDE.md` section citation in either token order
(superseded 2026-08-23, issue #15: `standards/governance-sync.md` used to be the one
`sharedPaths` file that wrote the heading before the filename, in a citation of the now-deleted
`## Governance overrides` carve-out; that citation is gone, but the parser still accepts both
token orders in case a future `sharedPaths` file writes one that way).

`docSectionCitationPatterns` is the single owner of the three citation-regex forms (double-quote,
single-quote, and §-omitted), used by both the `DESIGN.md` and `CLAUDE.md` scanners, so the two
cannot drift the way two hand-copies of the same regex could. `extractSection` throws, naming the
missing heading, instead of returning empty text: every AC5 parser below depends on that failure
being loud, not silently readable as "this section has nothing to check."
`extractSplitOwnershipDirs` is the single owner of the ownership map's four split-ownership
directory bullets, so the exactly-one-of check that reads it cannot drift from what the map itself
states. The `classes`-values check (AC4) exists because the sharedPaths/classes coverage checks
above it only confirm a key is present, not that its value is one of the two allowed literals; a
typo'd value would otherwise ship silently.

---

## definition-of-done.md clause retitles

Three clauses were renamed from their wedding-specific titles to generic ones so the checklist
reads correctly for any product, not just a wedding app. The renamed titles are the single
canonical form; every citer (`agents/reviewer-issue.md`, `agents/reviewer-pr.md`) was updated in
the same seed change:

| Old title (wedding-scavenger-hunt) | New title (this repo)  |
| ---------------------------------- | ---------------------- |
| Host takedown path                 | Operator takedown path |
| Party-sized data                   | Production-sized data  |
| Guest undo                         | User undo              |

Clause 9 ("Visual changes need owner approval" in the source) was retitled **"Pre-review-gated
changes"** and rewritten to defer to `repo-profile.json`'s `preReview` field rather than asserting
a specific visual-approval-loop mechanism belonging to every repo.

---

## Hazards from the classification report: disposition

`docs/seed-classification-2026-08-16.md` § "Hazards" lists thirteen things that would break
silently if copied unfixed. Each is resolved, not copied, as follows:

1. **Hardcoded Windows `gh.exe` path** (in the source's `build.md`, `github-write/SKILL.md`,
   `apply-branch-protection.ps1`). Resolved: all three now resolve the gh invocation from
   `repo-profile.json`'s `ghPath` field; no committed file names an absolute path.
2. **Repo-specific CI check names hardcoded in `apply-branch-protection.ps1`.** Resolved: required
   checks are now a `-RequiredChecks` parameter, defaulting to `repo-profile.json`'s
   `ciCheckNames` (this repo: `["build"]`).
3. **Critical-dependency list duplicated in three places, drift-guarded by a test.** Resolved by
   removing the duplication rather than re-guarding it: the list now lives in exactly one place,
   `repo-profile.json`'s `criticalDependencies` field; `.claude/rules/dependencies.md` and
   `tools/classify-dep-pr-core.ps1` both defer to it instead of each declaring a copy.
   `.github/dependabot.yml` (governance#28) is the third historical copy's equivalent here, and it
   carries no `exclude-patterns` today because `criticalDependencies` is `[]`: Dependabot cannot
   read `repo-profile.json`, so a future non-empty list would have to be mirrored into
   `dependabot.yml`'s `exclude-patterns` by hand, the same way a child repo already must.
   `tests/classify-dep-pr.test.js` was rewritten to prove the profile-supplied-list mechanism
   itself, including this repo's own empty list, rather than cross-checking three string copies.
4. **`$VISUAL_SURFACE_GLOBS` hardcoded in `visual-surface.ps1`.** Resolved by non-porting:
   `tools/visual-surface.ps1`, `tools/check-visual-approval.ps1`,
   `tools/persist-visual-approval.ps1`, and `.claude/rules/visual-surface.md` are not part of
   this seed. This repo declares `"preReview": "none"` and `"surfaceGlobs": []`; a child repo
   that wants this specific mechanism ports its own copy with its own glob list.
5. **`orchestrator.md`'s doc-currency trigger paths hardcoded to the wedding app's layout.**
   Resolved: the doc-currency step now reads `repo-profile.json`'s `docCurrencyPaths` field. This
   repo declares an empty list, so the step correctly never fires here (a docs-only repo has no
   source surface for it to compare against).
6. **Drift-guard tests cited by name as the enforcement keeping paired definitions in sync.**
   Partially resolved, by scope: `tests/classify-dep-pr.test.js` is ported, rewritten for the
   profile mechanism (see hazard 3). `tests/visual-approval.test.js` is not ported, because the
   mechanism it guarded (hazard 4) is not ported either; there is nothing here for it to guard.
   `tests/comment-budget.test.js` is not ported (this repo has no `src/**/*.js` comment-budget
   CI gate); `standards/design-philosophy.md`'s citation to such a gate was reworded to describe
   it as something a repo may declare, not a fact asserted about every repo.
7. **`.githooks/commit-msg` requires PowerShell on PATH, dot-sources `issue-core.ps1`, assumes
   PowerShell exists even on non-Windows CI.** Partially resolved: the hook now probes for either
   `powershell` or `pwsh` on PATH, in that order, and fails closed with an explicit message if
   neither is found, rather than assuming `powershell` specifically exists. Not resolved: some
   PowerShell launcher is still required; a host with neither on PATH cannot commit code without
   `--no-verify`, and there is still no non-PowerShell classification path for non-Windows CI. The
   same launcher dependency applies to `.githooks/pre-commit`, the ownership-map wall issue #11
   adds: it dot-sources `tools/ownership-core.ps1` (itself dot-sourcing
   `tools/governance-sync-core.ps1`) and fails closed the same way when no launcher is found. A
   future issue on the sync backlog can address a cross-platform commit-msg/pre-commit gate if
   that becomes load-bearing. This entry matches the tree for both `commit-msg` and `pre-commit`
   as of this change.
8. **`reviewer-architecture.md` naming `.agents/skills/` as an externally-managed excluded
   directory a repo without it would carry as a dangling exclusion** (the source hazard also named
   a periodic-audit section in `orchestrator.md`; that section WAS ported, at
   `agents/orchestrator.md:351` ("Periodic full-system architectural audit"), and already carries
   the same qualified wording, "an externally-managed design-skills directory, if this repo has
   one"). Resolved in `reviewer-architecture.md`: reworded to "if such a directory exists," never
   asserted as fact about this repo.
9. **`realign.md` cites a wedding-repo `data/wip-issues/357-...md` file by literal path, already
   dead in the source since `data/` is gitignored there too.** Resolved by not re-introducing it:
   the port drops the dead citation rather than carrying it forward.
10. **`check-freshness.ps1`'s `$CARVE_OUT_PATHS`/`$MAX_DRIFT_COMMITS` are single-homed constants;
    duplicating the file across repos reintroduces the drift risk its own comment warns against.**
    Resolved by issue #3: the sync mechanism exists now, so "each repo carries its own copy of
    the governance tree" no longer means "each repo's copy drifts unrecoverably." A child that
    runs `tools/governance-sync.ps1` at build start pulls this file (and every other
    `sharedPaths` entry) back into sync with this repo's own copy on every build; see
    § "Governance sync" below.
11. **Branch name `main` assumed throughout, not parameterized.** Resolved for the three tools
    named in the report (`apply-branch-protection.ps1`, `new-agent-worktree.ps1`,
    `check-freshness.ps1`, all three now reading `repo-profile.json`'s `defaultBranch` field via
    the shared `tools/repo-profile-core.ps1` reader, falling back to the literal `main` only if
    the profile is unreadable or the field is absent). `realign.md`'s prose was also reworded to
    speak of "the default branch" generically rather than a literal `main` string, but that
    rewording had not actually landed at the initial seed commit despite this entry claiming it
    had; the PR-review fix round on this issue's implementation caught the gap and did the
    rewording for real. This entry now matches the tree.
12. **`orchestrator.md`'s Write/Edit scope comment hardcodes bookkeeping filenames
    (`buildlog/<N>-<PR>.md`, `BUILDLOG.md`).** Not a hazard in this repo: `buildlog/` and
    `BUILDLOG.md` are this repo's own bookkeeping convention too (ported by plan step 4), so the
    reference is accurate here, not dangling. Kept as-is, deliberately.
13. **`docs/north-star.md` referenced as load-bearing but wedding-specific; ported governance
    needs an equivalent goals-doc convention or the references dangle.** Resolved: every
    reference to a specific goals-doc filename (`.claude/hooks/goal-gate.ps1`,
    `.claude/commands/resume.md`, `standards/decision-heuristics.md`) was reworded to defer to
    `repo-profile.json`'s `goalsDoc` field. This repo declares `"README.md"`. As with hazard 11,
    two of the three files (`goal-gate.ps1`, `resume.md`) were genuinely reworded at the initial
    seed commit; `standards/decision-heuristics.md` still named `docs/north-star.md` literally
    despite this entry claiming otherwise. The PR-review fix round on this issue's implementation
    caught and fixed the gap; this entry now matches the tree.

---

## Governing-artifact surface: membership fixes

`CLAUDE.md` § "Governing-artifact surface" was corrected during the PR-review fix round on this
issue's implementation:

- **Added `.github/` and `scripts/`.** Both carry enforcement machinery, not just prose: `.github/`
  holds the CI workflow that runs the em-dash and test gates, and `scripts/` holds the gate
  scripts themselves (`check-emdash.js` and `buildlog-glue.js` plus their `-core.js` pairs). A
  change to either changes what the pipeline enforces, which is exactly what the governing-artifact
  surface exists to catch, so omitting them was a gap, not a deliberate scoping choice.
- **Dropped `docs/`.** `docs/` holds provenance records (`docs/seed-classification-2026-08-16.md`,
  the evidence for this seed) and any future archival write-ups, not enforcement machinery. A
  change there does not change what any gate checks or what any agent is bound to, so it does not
  belong on a list whose purpose is routing enforcement-affecting changes through the normal
  pipeline like any other change; `docs/` content still goes through the normal pipeline regardless
  (every change does), it just is not what makes a change count as a "governance change" for
  purposes of this list.

## Lean review process rationale

This repo runs adversarial review with no proof-layer bureaucracy: no evidence-capture artifacts,
no severity adjudicator, no reviewer panels, and (per `tools/apply-branch-protection.ps1`)
`required_approving_review_count` stays 0 by default, since a solo-maintainer repo cannot have its
owner approve their own PR. CI plus independent adversarial review is the gate, not a human
approval click. The full history of that decision, including the proof-layer teardown it replaced,
is the wedding-scavenger-hunt repo's own `DESIGN.md`, an explicitly-marked provenance note; this
repo's own history begins at its 2026-08-16 seed and does not carry that teardown ADR forward. The
posture this leaves behind is tamper-evident, not tamper-proof, the same honest framing
`WHAT-IT-CHECKS.md` uses for what is and is not mechanically enforced here.

## Branch-protection strictness

`tools/apply-branch-protection.ps1` sends `required_status_checks.strict = $false`. `strict =
true` is GitHub's "require branches to be up to date before merging"; the owner turned that
setting off across every protected repo on the account on 2026-07-17 and reconfirmed the decision
on 2026-08-19, so the tool's fixed payload matches the owner's actual, standing choice rather than
the stale-merge protection an earlier version of this tool treated as mandatory. This is still not
a per-repo choice the tool exposes: a repo that wants `strict = true` back does not get it by
passing a switch or editing its own copy of the script. It adds a profile field (a new
`repo-profile.json` key the script reads, the pattern every other repo-specific value in this tool
already follows) through a governance issue, so the change is reviewed and the resulting behavior
is declared, not silently forked per checkout.

## Merge policy and pre-review rationale

This repo's merge policy: a change off the declared Pre-review surface merges once adversarial
review passes and CI is green, with owner control staying upstream (which work is specced, via
issues) and downstream (revert, via git history); a change on the declared Pre-review surface is
the deliberate exception, passing the Pre-review step (`agents/orchestrator.md` § "Pre-review
step") before its criteria are even written. This repo's own profile declares `"preReview":
"none"` and `"surfaceGlobs": []` (see hazard 4's disposition above), so the Pre-review step never
triggers here today; the mechanism stays documented so a child repo that declares a real
pre-review process (for example a live visual-approval loop) has somewhere generic to defer to.

## Keep-test rationale

`standards/design-philosophy.md`'s three-prong keep test for comments (why-not-what, trap,
pointer) is ported as-is from the wedding-scavenger-hunt repo, where the pattern traces to that
repo's issue #1167 (an explicitly-marked provenance note). The full worked argument and examples
live in that repo's own `DESIGN.md`, not reproduced here: this repo has no `src/**` application
code surface of its own yet to anchor fresh examples against, so re-deriving the argument from
scratch would be invention, not the resolved pointer AC 6 requires.

## Wave-governance mechanisms: owner decisions

Grandfathering (a mid-wave governance change governs from the next issue picked up onward, not
retroactively), owner-invoked whole-of-wave review (`/post-wave-review`, never automatic, never a
gate), and the doc-currency step (an implementer-side, `.md`-only step, no reviewer of its own)
are all owner decisions carried forward from the wedding-scavenger-hunt repo's governance history
as already-settled policy, per `standards/adversarial-review-protocol.md` § "Wave governance:
grandfathering, owner-invoked wave review, doc-currency step". None of the three has been
re-litigated in this repo; the mechanics live in that standard's section, not restated here.

## Reviewer-architecture lens promotion

The architecture lens (`agents/reviewer-architecture.md`) gates round 1 automatically on a
structural change, per `standards/adversarial-review-protocol.md` § "Reviewer count by artifact".
This promotion from advisory to gating was an owner decision made in the wedding-scavenger-hunt
repo's history (after a trial period, per that protocol section's § "Advisory-lens lifecycle"),
carried forward here as already-settled policy rather than re-litigated.

---

## CI gate for added em dashes

`scripts/check-emdash.js` (and its pure core, `scripts/check-emdash-core.js`) rejects any PR
whose added lines contain a literal em dash or its HTML-entity forms. In CI, it diffs the PR's
commits against `repo-profile.json`'s `defaultBranch` (default `origin/main`, overridable via the
`EMDASH_BASE` environment variable), so every line this seed itself adds counts as "added": the
seed PR is what makes this gate self-consistent from the very first commit. Run locally, it
additionally scans the working tree and any new untracked, non-gitignored files. The working-tree
scan is `git diff HEAD` (staged and unstaged changes together, one diff) once a HEAD exists; in a
repo with no commit yet, HEAD cannot resolve for that call, so two diffs are collected instead:
`git diff --cached` (empty tree vs the index, i.e. what's staged) and a plain `git diff` with no
ref (the index vs the on-disk worktree, i.e. unstaged edits on top of whatever is staged) -- `git
add` makes a file tracked even with nothing to commit it into, so such a file is invisible to the
untracked-file scan below and needs both diffs to be seen in every uncommitted state. Together
the two diffs see every uncommitted tracked-file change; unlike `git diff HEAD`, they also catch
staged content that was since reverted on disk, since the `--cached` half still sees it as newly
staged even after the worktree copy no longer carries it -- the no-commit-yet path is strictly
stricter than the HEAD-present path here, which is what acceptance criterion 1 wants. The
untracked-file scan diffs each file against `/dev/null` with `git diff --no-index`, enumerated
via `git ls-files --others --exclude-standard -z` and NUL-split rather than newline-split or
trimmed (`-z` is what makes that enumeration verbatim, with no quoting of any byte), so a path
with an embedded newline or leading/trailing spaces survives intact. Every git invocation also
runs with `core.quotePath=false`, so a path with non-ASCII bytes comes back as its real on-disk
name rather than git's quoted rendering -- the earlier form of this scan trusted that quoted
rendering as a literal path and handed it straight to `git diff --no-index`, which could not open
it, and degraded that failure into "no differences found." `core.quotePath` does not reach a
double quote, a backslash, or a control character in a path, though: git always escapes those
three regardless of the setting (see the three known gaps below for what still isn't covered).
Each collected diff is fed to `findEmdashViolations` separately and the results are merged and
de-duplicated on file-plus-line, never concatenated first: `findEmdashViolations` builds one
removed-line carry set per call, so concatenating would let a line deleted in the committed range
wrongly exempt the same line re-added as uncommitted work. That same file-plus-line key is also
the de-dup boundary across diffs whose line numbers come from different coordinate systems (a
committed-range line number is relative to HEAD's version of the file; a working-tree line number
is relative to the file on disk right now), so a genuinely separate working-tree violation
landing on the same line number as a committed-range one in the same file is under-counted --
never dropped to a clean exit, since the exit status still reflects that at least one violation
was found. The revert escape (a commit message carrying git's canonical revert marker) suppresses
only the committed-range diff; the working-tree and untracked-file diffs are still collected and
scanned regardless, so a dirty tree on top of a reverted range still fails the check. Three known
gaps remain in the local scan: it cannot see into a file git treats as binary (see
`WHAT-IT-CHECKS.md`) in any of the three uncommitted forms; the untracked-file scan is capped at
`MAX_UNTRACKED_FILES` (2000) files, failing loud with a named remedy rather than silently
skipping the excess, since each untracked file costs one `git diff --no-index` subprocess spawn;
and a file name carrying a double quote, backslash, or control character still prints in git's
escaped form with the diff `b/` prefix still attached, since the prefix stripper only matches an
unquoted leading `a/` or `b/` (the violation is still counted and still fails the check; only the
printed name is affected). `EXCLUDED_PATHS`
is `[]` in this repo: no path is exempt from the gate, unlike the wedding-scavenger-hunt repo's
own copy, which carves out an archival directory this repo does not have. `tests/check-emdash.test.js`
proves the exemption is really gone (a behavioral test: an em dash under a `governance/` path is
now reported, not silently passed) so a future re-widening of `EXCLUDED_PATHS` would fail that
test rather than merge silently.

---

## Bounded git buffer

`scripts/check-emdash.js` caps the `git log`/`git diff` output it reads at 256 MiB
(`MAX_BUFFER_BYTES`) and fails loud with a named remedy (narrow `EMDASH_BASE`, or raise the cap)
rather than silently truncating a huge diff and missing violations past the cut point.

---

## Governance sync

Issue #3 ships the mechanism `README.md`'s "Rules of the road" and this file's own seed ADR had
stated as policy but left unbuilt: `tools/governance-sync.ps1` (the wrapper, the only file with
side effects) and `tools/governance-sync-core.ps1` (the pure planning logic), wired into
`.claude/commands/build.md` step 0b and `agents/orchestrator.md`'s Operating rules, reviewed per
the new `standards/governance-sync.md`.

**Pull, not push.** A child repo runs the sync tool against this repo at build start, rather than
this repo pushing changes out to a registry of children. This was the owner's settled design
(2026-08-16, recorded in the seed ADR above): no registry file, no fanout workflow, no PAT held
here with write access to every child. A child opts in by declaring `governanceHome` and
`syncIssue` in its own `repo-profile.json`, a file the sync never writes (it sits in
`excludedPaths`), so there is nothing here for this repo to register or track per child.

**Exit-code contract and its no-stuck-state property (non-dry-run runs).** `0` covers every
outcome where nothing needed doing, or work was handed off cleanly to a PR or a child issue; `1` is
a configuration error caught before any clone or network access; `2` covers every operational
failure, including any unhandled exception, via a `try`/`catch`/`finally` that removes the temp
clone and any sync worktree on every exit path. Outside `-DryRun`, every exit-0 outcome ends in one
of four states, decided by the rule checker (`Get-SyncClassification` in
`tools/governance-sync-core.ps1`; full rule set: `standards/governance-sync.md` § "What a sync
is"): nothing to do (the plan is empty; this path also makes a best-effort attempt to close a
stale standing structure issue, per its own note below, but never lets that attempt affect the exit
code); a sync PR open with its URL printed and no withheld path (marker: `sync PR opened`/`sync PR
open`); a sync PR open carrying only what was not withheld, alongside the child's standing
structure issue naming the withheld paths (marker: `structure change: partial withhold`); or no PR
at all, with only the child's standing structure issue open (marker: `structure change: no sync
PR`). There is no non-dry-run exit-0 state where a sync is pending but neither a PR nor a structure
issue exists to carry the decision: a killed or interrupted run leaves, at worst, a stale local
branch or worktree registration the next run cleans up (the branch-rebuild step and the
try/finally cleanup in `tools/governance-sync.ps1`), never a plan that silently vanishes. The
whole-manifest comparison that drives the structure verdict (never an enumerated subset of fields)
is deliberate: `classes`, `classesDefault`, `arrivesAsStructure`, `repoProfileFields`, and
`shelfRoots` each change what a receiving child must itself do when they move, and a field added to
the manifest later is something nobody has judged yet, so comparing the whole file withholds it by
default instead of shipping it blind.

**The empty-plan close is best-effort, never load-bearing.** The nothing-to-do path (above) also
closes a stale standing structure issue when a human has adopted a structure change by hand since
the last run, so the row does not stay open forever; but resolving and calling `gh` for that
cleanup must never be able to turn "nothing to sync," the tool's single most common outcome, into a
failure. `tools/governance-sync.ps1` wraps both the `gh` resolution and the close call in one
`try`/`catch` on this path: any failure there (`gh` unresolvable, not authenticated, offline) is
written to stderr as a warning and the run still prints `in sync with <sha>` and exits `0`.

**The `classes` lookup: precedence.** This paragraph is the one home for the precedence rule
alone: when more than one `classes` key matches a path (an exact key and one or more `prefix/**`
keys can all match the same path), an exact key always wins over any `prefix/**` key, and among
matching `prefix/**` keys the longest prefix wins. Neither `standards/ownership-map.md` nor
`standards/governance-sync.md` states this ordering, so `tools/governance-sync-core.ps1`'s code
comments point here rather than to either. The `classesDefault` rule itself, what a path no
`classes` key matches falls to, is stated once in `standards/governance-sync.md` § "What a sync
is", the synced document a child actually receives; this file does not restate it.

**The same-tree invariant.** The plan a real (non-`-DryRun`) run applies is computed against a
detached worktree at the child's `origin/<defaultBranch>`, created fresh after a `git fetch`, not
against the invoking checkout. The invoking checkout's tree only feeds the `-DryRun` preview.
Without this, a retired path could hash clean in a stale invoking checkout while the branch being
synced holds diverged content, and a plan computed against the stale tree would silently prune
content the branch being synced never actually matched.

**One profile, parsed once.** The wrapper reads the resolved profile file exactly once as JSON;
`governanceHome` and `syncIssue` come directly off that parsed object (property presence, not
just value, decides `governanceHome`'s outcome), while `defaultBranch` and `ghPath` go through
`Get-RepoProfileValue -ProfilePath <that same file>` so their fallback defaults stay single-homed
in `tools/repo-profile-core.ps1`'s `$FieldDefaults` table. `governanceHome` deliberately gets no
`$FieldDefaults` entry: there is no safe default for "where is my governance home," and a
defaulted `self` would make a child that lost the field read as the governance home forever.

**The `retired` entry schema and provenance-checked pruning.** A retired entry is
`{ "path", "sha256" }`, not a plain string: `sha256` is the last-shipped content's hash, and a
child's copy is pruned only when its current hash still matches. A child holding a copy older
than the last-shipped version (or any locally edited copy) is retained-divergent instead,
surfaced in the sync PR body and by a standing `WARNING retained divergent` line on every build
(superseded 2026-08-23, issue #15: no contradiction reviewer disposes of it by hand any more;
`tools/governance-sync.ps1` files a standing retained-divergent-paths issue naming every such
path the child has not acknowledged under its own `acknowledgedDivergentPaths`, closed once none
remain, per § "Merge-on-green sync" below). This is a deliberately accepted single-hash
limitation: the mechanism does not attempt to distinguish "diverged before the last retirement"
from "diverged after."

**`tests/**` and this repo's own config files do not sync.** They assert facts about this repo's
own tree (manifest coverage of its own file list, its own profile values) and would fail on
arrival in a child whose tree differs. Each child keeps its own test surface.

**The `.claude/settings.json` relocation.** Moved from `sharedPaths` to `excludedPaths`: a
child's `settings.json` carries that repo's own permission allowlist and hook wiring, and an
unconditional sync overwrite would clobber it, damage no automated check catches (superseded
2026-08-23, issue #15: a sync PR now merges on green CI with no reviewer at all, so this
exclusion is what stands between a content-classed sync and an unreviewed clobber of a child's
own settings, not merely a review question that would have missed it). The hook
scripts themselves (`.claude/hooks/*.ps1`) stay shared; registering them in a child's
`settings.json` is that child's own adoption work.

**The `WHAT-IT-CHECKS.md` relocation.** Moved from `sharedPaths` to `excludedPaths`, with no
`retired` entry. Each repo's own `WHAT-IT-CHECKS.md` documents that repo's own CI and coverage
(this repo's has no eslint and no coverage gate; a child's may run CodeQL, mutation testing, or a
job this repo has never heard of), so an unconditional sync overwrite would replace a child's true
owner-facing doc with this repo's false one. No `retired` entry accompanies the move: a tombstone
would prune or permanently flag a child's own, still-current copy as retained-divergent, exactly
the outcome this relocation exists to avoid.

**The `governance-manifest.json` relocation.** Moved from `excludedPaths` to `sharedPaths` by
issue #11: every child now receives the ownership manifest itself, read-only, so a child-side
consumer (the Step 3 rule-checker, governance #14) can read `classes` and `arrivesAsStructure`
without the parent hand-copying the map into every child separately. Unlike the
`WHAT-IT-CHECKS.md` relocation above, this file states no fact specific to any one repo's own
build, so an unconditional sync overwrite carries no risk of clobbering a child's own true copy.

The rule checker (above) made this delivery path unreachable in practice, though: any run where
the parent's and child's manifests differ is itself a structure verdict, so a manifest update is
never machine-merged. `governance-manifest.json` still reaches a child on that child's first
delivery (no installed copy is no diff), and it is named among the withheld paths in the standing
structure issue when it is part of the plan and differs, for a human to apply by hand; it is never
carried by an ordinary content PR once a child already has a copy that differs from the parent's.

**The `.githooks/` executable-bit repair.** `tools/governance-sync.ps1` restages the whole
`.githooks/` set found in the sync worktree with `--chmod=+x` on every run that has anything else
to sync, not just the files that classified as an Add or an Update by content. `core.fileMode` is
`false` on the Windows machine that authors this repo, so a hook file whose content already
matches the parent can still be tracked at `100644` in a child that synced before this repair
shipped, since a plain `Copy-Item` never carried the mode across; content-based classification is
blind to mode entirely, so such a file is neither an Add nor an Update on any later run and would
otherwise never be restaged, leaving the hook silently skipped by git forever. The tradeoff: every
run that has something else to sync now re-adds every `.githooks/` file's mode, including files
whose content is untouched, rather than touching only what the plan actually changed. The
remaining limitation: a run with nothing else to sync is still suppressed as empty (the sync
wrapper's own `isEmpty` check), so a mode-only repair is not itself grounds to open a sync PR; it
rides the next sync that carries any other change.

**The child `CLAUDE.md` governing-artifact-surface warning.** `CLAUDE.md` itself stays out of
`sharedPaths` (an unconditional overwrite would clobber a child's local rules), but every child
must carry its own `## Governing-artifact surface` heading. `Get-SyncPlan` checks the child's
`CLAUDE.md` for the literal heading and emits a warning when it is absent, printed on every sync
run until the child adds it.

**The `syncIssue` standing-issue mechanism.** A child's `.githooks/commit-msg` gate blocks a code
commit (a sync commit stages `.ps1`/`.js`/etc. files) that names no GitHub issue. Rather than
inventing a per-sync issue, a child declares one standing issue number, and every sync commit
references it (`(#<N>)`), satisfying the gate without a new issue per pull.

**The citation-prefix rule.** Every `DESIGN.md § "Title"`-shaped citation inside a `sharedPaths`
file now names the governance repo explicitly (`the governance repo's DESIGN.md § "Title"`),
rewritten once at the source rather than rewritten by the sync mechanism at delivery (the shipped
tool does not rewrite file contents beyond copying them verbatim). These citations are rationale
pointers, not load-bearing definitions: every operative rule a shared file instructs an agent to
execute lives in that file or another synced file; the citation points at recorded reasoning in
the home repo, and the prefix makes that explicit instead of implicit.
`tests/governance-manifest.test.js`'s citation-prefix guard keeps a future citation from
regressing to the unprefixed form.

**The gh resolution chain.** The committed `ghPath` field alone cannot reach a machine where `gh`
lives elsewhere (per-machine notes live in the gitignored, unparsed `CLAUDE.local.md`), so
`tools/governance-sync-core.ps1`'s `Resolve-GhPath` tries, in order: the committed profile value
(via `Get-Command`), then the `GH_PATH` environment variable (the per-machine override), then the
vendor default install location under `$env:ProgramFiles` (guarded against an unset
`$env:ProgramFiles`, which is normal on a non-Windows host), then throws, naming all three probes.

**The `origin` remote-name assumption.** Every clone and worktree this pipeline creates names its
primary remote `origin` (git's default). Not parameterized speculatively: recorded here as an
assumption, to be revisited if a real repo ever needs otherwise.

**A hand-closed sync PR re-offers, deliberately (superseded 2026-08-23, issue #15: this passage
described a reviewer's decision to close a sync PR unmerged; a content-classed sync PR now merges
itself on green CI with no reviewer to make that decision. The property it protected still
holds, by a different route: a child cannot silently keep a diverged copy of a shared file
forever, because retained divergence is never silent, see § "Merge-on-green sync" below).** A
human can still close a sync PR by hand (a red PR, a branch protection outage, or any other
reason to intervene); the next build re-offers the same diff, or its current equivalent if the
parent has moved on since. The two ways to end that re-offer are the same two ways any retained
divergence ends: declare the path under `acknowledgedDivergentPaths` in this repo's own
`repo-profile.json`, or fix the global rule in the governance home first, since the ownership
wall forbids editing a parent-owned file's local copy.

**Orphan-branch recovery and supersession.** A stale local branch of the exact name a run is
about to create can only hold a prior machine-generated sync commit, reproducible from the same
inputs, so it is deleted and rebuilt rather than reused. A remote sync branch is never trusted as
current either: it is always rebuilt from the current plan and force-pushed
(`--force-with-lease`) over whatever is there. A branch name for a different parent commit is not
a collision: the parent moved, and the new sync supersedes the old one; `tools/governance-sync.ps1`
itself closes the superseded PR and deletes its branch before arming the new one (issue #15's
superseded-PR sweep, § "Merge-on-green sync" below), not a reviewer, since no reviewer sees a
content-classed sync PR any more.

## Merge-on-green sync (issue #15)

**Decision (owner, 2026-08-21).** A content-classed sync PR merges itself on green CI, with no
reviewer, human or agent. Issue #11's ownership wall (a hard, mechanically-enforced separation
between parent-owned and child-owned paths) and issue #14's rule checker (only a content-classed
sync opens a PR at all) are what make this safe: separation replaces review as the safety
mechanism for a sync PR specifically, not for any other kind of pull request in any repo this
governance layer covers. `tools/governance-sync.ps1` calls `gh pr merge --auto` on the PR it just
opened or refreshed and does not wait for the merge; the triggering build continues on the tree
it already has, and the merged governance arrives at the next build, consistent with pull-on-
build. (Superseded 2026-08-23, issue #15, the whole vocabulary this replaces: every section of
`standards/governance-sync.md` and `standards/adversarial-review-protocol.md` that described a
sync PR's now-retired one-question review, its escalation path, its override-declaration home,
and its close-and-re-offer rule is deleted, not merely reworded, and so is every pointer elsewhere
in the tree that sent a reader to one of them; a live citation to a deleted section is exactly how
a child's orchestrator would fall back to the full round-1 review gate this issue exists to
eliminate.)

**What replaced the override home.** A child that wants to keep a retained-divergent path on
purpose declares it under `acknowledgedDivergentPaths` in its own `repo-profile.json` (§
"repo-profile.json schema" above), the same place every other repo-declared value already lives,
rather than a heading in `CLAUDE.md` a reviewer used to read. A child that cannot follow a global
rule at all has exactly one path: change the rule in the governance home, since the ownership
wall forbids editing a parent-owned file's local copy; there is no local override to declare
instead.

**Two gates before "green" is trusted, not one.** `gh pr merge --auto` merges immediately on a
branch with no required check, CI or none, so the tool confirms first that every check the child
declares in `ciCheckNames` is actually required on its default branch (reading
`required_status_checks.checks`, the same field `tools/apply-branch-protection.ps1` writes and
reads back), never assuming a required-checks list that was never applied. It cannot verify a
child's parent-owned-path CI guard job (issue #11's wall counterpart) is among those declared
names, because no such job is defined, named, or specified anywhere in this tree today: it is
purely a future child-owned addition. A child that adds one names it and lists that same name in
its own declared `ciCheckNames`, so this gate requires it; until then there is nothing here for
this tool to check.

**Two readers of `required_status_checks.checks`, no shared home (recorded gap).**
`tools/governance-sync.ps1`'s `Get-CiGateStatus` and `tools/apply-branch-protection.ps1` both
read `required_status_checks.checks` off the GitHub API by hand; neither calls into the other and
no third file holds the field name for both to share. `tools/apply-branch-protection.ps1` is
outside this issue's declared `Touches` and stays untouched here. Each read site's own comment
names the other as its twin, so a GitHub field rename is at least discoverable from either side,
but a rename must still be applied to both by hand; unifying them into one shared reader is
follow-up work, not done by issue #15.

**Non-fatal by contract.** Every step of arming (the CI-check gate, the superseded-PR sweep, the
`gh pr merge --auto` call itself) is wrapped so a failure anywhere in that path is a warning on
stderr, never a non-zero exit: a sync PR that cannot be armed stays open for hand-merge, and the
run that tried to arm it still succeeded at its actual job, computing the plan and shipping the
PR.
