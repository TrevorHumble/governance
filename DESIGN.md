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

Every field a shared governance file may need to read, one per line, with allowed values:

- `preReview` (string): the name of this repo's declared pre-review process, or the literal
  `"none"`. When not `"none"`, it should name (in the repo's own docs) a process file describing
  the mechanism, e.g. a live visual-approval loop.
- `surfaceGlobs` (array of strings): the pre-review surface, path globs a change must touch to
  trigger the declared pre-review step. Empty when `preReview` is `"none"`.
- `shipMode` (string): how a passing change reaches its default branch. This repo: `"pr"` (branch,
  PR, CI, merge on green).
- `criticalDependencies` (array of strings): package names whose bump is held for review
  regardless of semver, per `.claude/rules/dependencies.md`. This repo: `[]` (no production
  runtime dependencies to protect).
- `ciCheckNames` (array of strings): the real, observed CI check-run names required on the
  default branch before merge, consumed by `tools/apply-branch-protection.ps1`. This repo:
  `["build"]`, the single job `.github/workflows/ci.yml` defines.
- `docCurrencyPaths` (array of strings): source paths whose change triggers the orchestrator's
  `doc-currency` step (`agents/orchestrator.md` § "Doc-currency step"). This repo: `[]` (a
  docs-only repo has no source surface for that step to compare against).
- `goalsDoc` (string): the path to this repo's own goals/north-star doc, if any. This repo:
  `"README.md"`.
- `checkCommands` (object): the mechanical check commands standards and docs should defer to
  instead of hardcoding an `npm run <script>` literal. This repo: `{"test": "npm test",
  "emdash": "npm run check:emdash"}`.
- `ghPath` (string): the GitHub CLI invocation. This repo: `"gh"` (on PATH). A machine where `gh`
  lives elsewhere records the absolute path as a per-machine note in that machine's own
  `CLAUDE.local.md`, never in this committed file.
- `defaultBranch` (string): the branch `tools/check-freshness.ps1`, `tools/new-agent-worktree.ps1`,
  and `tools/apply-branch-protection.ps1` treat as the remote default, instead of a hardcoded
  `origin/main`. This repo: `"main"`.

---

## governance-manifest.json semantics

`retired` (array): tombstones for a shared path this repo used to declare shared but no longer
does; empty at seed time (nothing has been retired yet).

`sharedPaths` (array of glob-ish strings): exactly the governance files a child repo is meant to
receive on a future sync. A `path/**` entry means "everything under this directory that exists at
sync time," so a wildcard entry never goes stale as files are added or removed beneath it; a bare
path entry names one specific file, and is checked to exist by `tests/governance-manifest.test.js`.
Deliberately excluded: this repo's own build and record files (`package.json` and its lockfile,
`vitest.config.mjs`, `.prettierrc.json`, `.gitignore`, the CI workflow, `tests/**`, `README.md`,
`BUILDLOG.md`, the `buildlog/` fragments themselves, `docs/**`, `repo-profile.json`, `CLAUDE.md`,
`CLAUDE.local.md`, and the manifest file itself). Whether a child receiving a sync also receives
this repo's own enforcement tooling (`tests/**`, the vitest/prettier configs) is the sync issue's
question, not answered here.

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
8. **`reviewer-architecture.md` and `orchestrator.md`'s periodic audit naming `.agents/skills/`
   as an externally-managed excluded directory a repo without it would carry as a dangling
   exclusion.** Resolved: reworded to "if such a directory exists," never asserted as fact about
   this repo.
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
    `check-freshness.ps1`): each now reads `repo-profile.json`'s `defaultBranch` field, falling
    back to the literal `main` only if the profile is unreadable. `realign.md`'s prose was
    reworded to speak of "the default branch" generically rather than a literal `main` string.
12. **`orchestrator.md`'s Write/Edit scope comment hardcodes bookkeeping filenames
    (`buildlog/<N>-<PR>.md`, `BUILDLOG.md`).** Not a hazard in this repo: `buildlog/` and
    `BUILDLOG.md` are this repo's own bookkeeping convention too (ported by plan step 4), so the
    reference is accurate here, not dangling. Kept as-is, deliberately.
13. **`docs/north-star.md` referenced as load-bearing but wedding-specific; ported governance
    needs an equivalent goals-doc convention or the references dangle.** Resolved: every
    reference to a specific goals-doc filename (`.claude/hooks/goal-gate.ps1`,
    `.claude/commands/resume.md`, `standards/decision-heuristics.md`) was reworded to defer to
    `repo-profile.json`'s `goalsDoc` field. This repo declares `"README.md"`.

---

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
