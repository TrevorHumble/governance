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
global wins by default; a child overrides only by declaring it in its own local override file;
governance fixes land here; children pull on build. Seed content comes from
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
- `criticalPaths` (array of strings). Allowed: any list of path globs, or `[]`; a repo's own
  critical paths (join/auth, payment, moderation, export-core equivalents), consumed by
  `standards/issue-standards.md` § "Sonnet tier eligibility" gate (b): an issue touching a
  critical path is denied the `sonnet-only` award.
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
  machine's own `CLAUDE.local.md`, never in this committed file.
- `defaultBranch` (string). Allowed: any git branch name that exists on the remote; the branch
  `tools/check-freshness.ps1`, `tools/new-agent-worktree.ps1`, `tools/apply-branch-protection.ps1`,
  and `tools/repo-profile-core.ps1`'s callers treat as the remote default, instead of a hardcoded
  `origin/main`.

**`tools/repo-profile-core.ps1`.** All profile-reading PowerShell logic (resolving
`repo-profile.json`'s path, reading it if present, falling back to a named default if missing or
the field is absent) is single-homed in this file's `Get-RepoProfileValue -Field <name> -Default
<value>` function, resolved at `$PSScriptRoot\..\repo-profile.json` (the repo root). Its
`$FieldDefaults` table is the single home of per-field fallbacks a caller needs no `-Default`
argument for (the `defaultBranch` fallback of `'main'` lives there, mirrored once, deliberately, in
`scripts/check-emdash.js` as the sanctioned cross-language copy noted below). Every
PowerShell tool that reads the profile (`tools/check-freshness.ps1`,
`tools/new-agent-worktree.ps1`, `tools/apply-branch-protection.ps1`,
`tools/classify-dep-pr-core.ps1`) dot-sources it rather than carrying its own copy. This file was
added during the PR-review fix round on this issue's implementation, after the review found the
same profile-reading logic duplicated across four tools with two different resolution strategies;
it widens this issue's `Touches` beyond the originally-filed set (`tools/**` already covers it, so
no manifest change was needed). `scripts/check-emdash.js` is the one deliberate exception: a
Node script cannot dot-source a `.ps1` file, so it keeps its own small JS reader, with a comment
naming this file as the PowerShell-side owner.

---

## governance-manifest.json semantics

`retired` (array): tombstones for a shared path this repo used to declare shared but no longer
does; empty at seed time (nothing has been retired yet).

`sharedPaths` (array of glob-ish strings): exactly the governance files a child repo is meant to
receive on a future sync. A `path/**` entry means "everything under this directory that exists at
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
Whether a child receiving a sync also receives this repo's own enforcement tooling (`tests/**`,
the vitest/prettier configs) is the sync issue's question, not answered here.

`tests/governance-manifest.test.js` guards both directions: every declared `sharedPaths` entry
resolves to a real file (the AC5 promise), and, in the other direction, every git-tracked file in
this repo matches exactly one of `sharedPaths` or `excludedPaths`, never neither (a new governance
file landing in neither would silently never reach a child on sync) and never both (a file claimed
by both would hide a misclassification, the way `buildlog/README.md` used to be covered by a
blanket `buildlog/**` exclusion even while also declared shared, until the negation entry above
was added to keep the two sets disjoint).

**CLAUDE.md is excluded from `sharedPaths` but its `## Governing-artifact surface` section is not
optional for a child.** Every child repo must carry its own `## Governing-artifact surface`
section in its own `CLAUDE.md`, naming its own governing-artifact path list; how the global
CLAUDE.md template (including that section) reaches a child is the sync issue's design question,
not answered here, but the requirement itself is recorded here so the sync issue has a concrete
target: delivering the section, not inventing whether it is needed.

**`DESIGN.md` is excluded from `sharedPaths`, but any `sharedPaths` file that cites one of its
sections by name creates a child-repo obligation.** There is no frozen list of which files and
sections do this: the current set is derived mechanically, not hand-enumerated, so it cannot go
stale the way a written inventory did twice across two fix rounds on this issue. The guard is
`tests/governance-manifest.test.js`'s citation-coverage test, which scans every `sharedPaths` file
for a `DESIGN.md § "Title"` (or `DESIGN.md "Title"`) citation and fails if the quoted title has no
matching `## ` heading in this file. A human can run the same check directly: `npx vitest run
tests/governance-manifest.test.js`. None of the cited sections is itself in `sharedPaths`, so a
citation dangles in a child repo unless that child's own `DESIGN.md` carries the section, or the
sync mechanism rewrites the citation to point somewhere the child actually has. This is a
recorded target for the sync issue, not resolved here: a receiving child must either carry the
cited sections in its own `DESIGN.md` or the sync mechanism must rewrite the citations that name
them.

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
fast, not crash unrecoverably. A future sync mechanism should treat that as acceptable, not as a
sync defect.

---

## definition-of-done.md clause retitles

Three clauses were renamed from their wedding-specific titles to generic ones so the checklist
reads correctly for any product, not just a wedding app. The renamed titles are the single
canonical form; every citer (`agents/reviewer-issue.md`, `agents/reviewer-pr.md`) was updated in
the same seed change:

| Old title (wedding-scavenger-hunt) | New title (this repo) |
| --- | --- |
| Host takedown path | Operator takedown path |
| Party-sized data | Production-sized data |
| Guest undo | User undo |

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
   `tools/classify-dep-pr-core.ps1` both defer to it instead of each declaring a copy. This
   repo does not port `.github/dependabot.yml` at all (not in its Touches list), so the
   third historical copy has no equivalent here to drift. `tests/classify-dep-pr.test.js` was
   rewritten to prove the profile-supplied-list mechanism itself, including this repo's own
   empty list, rather than cross-checking three string copies.
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
   PowerShell exists even on non-Windows CI.** Not resolved; ported as-is. This is a real
   limitation this repo inherits unchanged; a future issue on the sync backlog can address a
   cross-platform commit-msg gate if that becomes load-bearing.
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
    Acknowledged, not newly resolved: this is an inherent property of "each repo carries its own
    copy of the governance tree" until the sync mechanism exists. It is exactly the drift problem
    this seed repo was created to eventually solve once sync lands; tracked there, not fixed by
    this issue alone.
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

`tools/apply-branch-protection.ps1` always sends `required_status_checks.strict = true`. This is
not a per-repo choice the tool exposes: `strict = true` is GitHub's "require branches to be up to
date before merging," and closing the stale-merge race it prevents (two PRs each going green
against an older default branch, then merging close together so the second lands on a tree CI
never actually ran) is the whole reason this tool exists. A repo that wants different behavior
does not get it by passing a switch or editing its own copy of the script: it adds a profile field
(a new `repo-profile.json` key the script reads, the pattern every other repo-specific value in
this tool already follows) through a governance issue, so the change is reviewed and the resulting
behavior is declared, not silently forked per checkout.

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
whose added lines contain a literal em dash or its HTML-entity forms. It diffs the PR's commits
against `repo-profile.json`'s `defaultBranch` (default `origin/main`, overridable via the
`EMDASH_BASE` environment variable), so every line this seed itself adds counts as "added": the
seed PR is what makes this gate self-consistent from the very first commit. `EXCLUDED_PATHS` is
`[]` in this repo: no path is exempt from the gate, unlike the wedding-scavenger-hunt repo's own
copy, which carves out an archival directory this repo does not have. `tests/check-emdash.test.js`
proves the exemption is really gone (a behavioral test: an em dash under a `governance/` path is
now reported, not silently passed) so a future re-widening of `EXCLUDED_PATHS` would fail that
test rather than merge silently.

---

## Bounded git buffer

`scripts/check-emdash.js` caps the `git log`/`git diff` output it reads at 256 MiB
(`MAX_BUFFER_BYTES`) and fails loud with a named remedy (narrow `EMDASH_BASE`, or raise the cap)
rather than silently truncating a huge diff and missing violations past the cut point.
