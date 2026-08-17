# Seed classification: wedding-scavenger-hunt governance, 2026-08-16

Researcher classification of every governance file in TrevorHumble/wedding-scavenger-hunt
(read at merge c77f61b lineage, worktree cut 2026-08-16), classifying each as GLOBAL (port
nearly as-is), LOCAL (stays in the wedding repo), or MIXED (generic core, wedding-specific
parts to scrub or split). Produced as research input for the governance-repo seed issue.

## Classification

| File | Verdict | Notes |
|---|---|---|
| standards/adversarial-review-protocol.md | GLOBAL | Fully generic review protocol; only reference is a citation to `CLAUDE.md` §"Governance freeze" as a live path-list pointer (repo-agnostic mechanism). |
| standards/agent-standards.md | GLOBAL | Generic agent-authoring checklist; no wedding content. |
| standards/decision-heuristics.md | MIXED | Generic decision procedure with wedding-flavored worked examples. |
| standards/design-philosophy-examples.md | MIXED | Generic pattern-matching examples but every Flag/Clean pair is illustrated with wedding domain code. |
| standards/design-philosophy.md | GLOBAL | Fully generic software-design standard; one example references a `DESIGN.md` issue #1172 pointer but the rule itself is generic. |
| standards/documentation-standards.md | GLOBAL | Generic doc-quality standard; the split table (DESIGN/CLAUDE/README/CONTEXT) is a reusable convention. |
| standards/edge-case-checklist.md | MIXED | Table is a generic input-type taxonomy; every "Example from this stack" column entry is wedding-specific. |
| standards/issue-standards.md | GLOBAL | Fully generic issue-quality standard (tiers, ACs, dependency map, sonnet-tier award mechanism). |
| standards/skill-standards.md | GLOBAL | Fully generic skill-authoring standard. |
| agents/implementation-agent.md | MIXED | Generic build-rule contract; a couple of example framework names (Express/SQLite/EJS). |
| agents/orchestrator.md | MIXED | Core pipeline (issue-review-implement-review-commit, model tiers, stop rules) is generic; visual-loop trigger paths and doc-currency surface are wedding-app-specific. |
| agents/orchestrator/autonomous-timed-run.md | GLOBAL | Fully generic timed-loop mechanism (clock-driven selector, Done-Early Cascade). |
| agents/orchestrator/dependabot-pr-path.md | MIXED | Generic dispatch stub, one line points at the wedding-critical dependency list. |
| agents/orchestrator/visual-approval-loop.md | MIXED | The phase-1/phase-2, freeze, two-doors mechanism is a portable design pattern; trigger paths and `npm run preview` tie it to this app. |
| agents/researcher.md | GLOBAL | Fully generic prior-art research agent. |
| agents/reviewer-agent.md | GLOBAL | Fully generic. |
| agents/reviewer-architecture.md | GLOBAL | Fully generic; directory names it checks (`agents/`, `.claude/skills/`, `standards/`) are convention names, reusable as-is. |
| agents/reviewer-briefing.md | GLOBAL | Fully generic audit mechanism. |
| agents/reviewer-design-philosophy.md | GLOBAL | Fully generic. |
| agents/reviewer-documentation.md | GLOBAL | Fully generic. |
| agents/reviewer-issue.md | GLOBAL | Fully generic (references `definition-of-done.md` and visual-approval-loop as repo-root/agent-relative conventions, not wedding content itself). |
| agents/reviewer-pr.md | GLOBAL | Fully generic; cited issue numbers (#190/#191/#196/#194) are evidence pointers, not domain content. |
| agents/reviewer-security.md | MIXED | The 4 charter questions are generic; trigger-class examples and the #196 worked example are wedding-app file paths. |
| agents/reviewer-skill.md | GLOBAL | Fully generic. |
| .claude/commands/build.md | MIXED | Pipeline steps are the generic orchestrator sequence; several steps hardcode wedding paths and a Windows-specific gh.exe path. |
| .claude/commands/buildlog.md | MIXED | Fold-and-ship mechanism is a generic pattern; depends on this repo's own `scripts/buildlog-glue.js` and `buildlog/README.md`. |
| .claude/commands/deploy.md | LOCAL | Entirely tied to the wedding host, domain, wedding date, and deploy script. |
| .claude/commands/post-wave-review.md | MIXED | The "owner-invoked outside-eye wave audit" mechanism is portable; the brief's narrative is wedding-specific. |
| .claude/commands/realign.md | GLOBAL | Mechanical git-freshness/overlap procedure is fully generic; one citation to a local wip-issue file is a hazard (data/ is gitignored, so the citation is dead even locally). |
| .claude/commands/resume.md | MIXED | Re-orientation procedure is a generic pattern; specific file list (`docs/north-star.md`) is wedding-repo-specific. |
| .claude/rules/dependencies.md | MIXED | Auto/review tiering mechanism and native-binary smoke-test rule are generic; the "wedding-critical" package list is domain-specific. |
| .claude/rules/visual-surface.md | MIXED | Path-scoped-rule mechanism is generic; the frontmatter paths (`src/views/**`, `src/public/**`) are this app's own layout. |
| .claude/hooks/goal-gate.ps1 | GLOBAL | Fully generic forcing hook; references "the North Star in CLAUDE.md" only as a generic term. |
| .claude/hooks/loop-gate.ps1 | GLOBAL | Fully generic. |
| .claude/hooks/session-greeting.ps1 | GLOBAL | Fully generic. |
| .claude/skills/capture-system-defect/SKILL.md | GLOBAL | Fully generic. |
| .claude/skills/github-write/SKILL.md | MIXED | Issue/PR/commit sync workflow is generic; hardcoded Windows `gh.exe` path. |
| .githooks/commit-msg | GLOBAL | Fully generic commit-msg gate. |
| tools/apply-branch-protection.ps1 | MIXED | Branch-protection-PUT mechanism is generic; required check names (`lint`,`test`,`smoke`,`Analyze (javascript)`) and hardcoded `gh.exe` path are this repo's own CI. |
| tools/assert-worktree.ps1 | MIXED | Fully generic worktree-isolation check; one comment line hardcodes a wedding-repo example path. |
| tools/check-deps-parity.ps1 | MIXED | Fully generic lockfile-parity checker; comments cite wedding-specific examples (`sharp`, `garden-party-pastels`). |
| tools/check-freshness.ps1 | MIXED | Fully generic freshness/overlap checker; comments cite this repo's path and issue numbers. |
| tools/check-visual-approval.ps1 | MIXED | Hash-drift-check mechanism is generic; depends on `visual-surface.ps1`'s wedding-specific glob config. |
| tools/classify-dep-pr-core.ps1 | MIXED | Tier-precedence mechanism is generic; `$WeddingCritical` package list is domain-specific. |
| tools/classify-dep-pr.ps1 | GLOBAL | Thin generic CLI wrapper. |
| tools/deploy.sh | LOCAL | Entirely tied to the wedding host's deploy target, Docker Compose setup, and wedding-photo data comments. |
| tools/issue-core.ps1 | GLOBAL | Fully generic issue-number resolution logic. |
| tools/new-agent-worktree.ps1 | GLOBAL | Fully generic worktree-creation mechanism; comments reference this repo's own incident history but no domain content. |
| tools/persist-visual-approval.ps1 | MIXED | Hash-freeze-record mechanism is generic; depends on `visual-surface.ps1`'s wedding-specific glob config. |
| tools/setup-hooks.ps1 | GLOBAL | Fully generic. |
| tools/visual-surface.ps1 | MIXED | Hashing mechanism is generic; `$VISUAL_SURFACE_GLOBS` hardcodes `src/views`, `src/public`. |
| CLAUDE.md | MIXED | The pipeline/governance-surface/model-policy/documentation-split framework is highly portable; goals, dates, deploy specifics, and wedding conventions are local. |
| DESIGN.md | MIXED | Governance ADR sections are portable rationale; app-architecture sections are LOCAL. |

## MIXED file details

**standards/decision-heuristics.md**
- "Example (settled by constraint - act)": admin flag stored in `data/` per `CLAUDE.md`. SCRUB (swap for a generic example or genericize the config reference).
- "Example (pattern-matched wrong fix)": cites `commit-msg` hook and `tools/setup-hooks.ps1`. SCRUB (keep as illustrative but note tool names are this repo's).

**standards/design-philosophy-examples.md**
- `shallow module` example: `saveThumb`/`makeThumb`, `src/services/photos.js`, `THUMB_WIDTH`. SCRUB (genericize to a generic file-processing example, or keep as "an example" without repo file path claims).
- `information leakage` example: `submissions`, `guest_id`, `src/services/badges.js`, `TRANSFERABLE_BADGES`. SCRUB.
- `redundant encoding` example: guest home view completed-task count/progress bar, cites `DESIGN.md` issue #1172. SCRUB (the paragraph explicitly says the live instance is wedding-specific and pinned to a wedding issue).
- All "Not a finding" guards reference guest-facing/screen-reader examples tied to the wedding UI. SCRUB wording, keep the underlying accessibility-carve-out logic (generic).

**standards/edge-case-checklist.md**
- Every row's "Example from this stack" column: "guest display name", "badge threshold", "leaderboard with zero submissions", "export path built from a guest-supplied filename", "HEIC posted to the photo intake (the #188 class)", "feed sort by created_at", "double-tap on the task-complete button", "guest lookup by a /j/:token link". SPLIT (drop the wedding column entirely, or replace with a neutral second example column); the input-type/edge-case taxonomy itself is the portable core.

**agents/implementation-agent.md**
- Rule 2: "Express, the SQLite driver, EJS" as example frameworks. SCRUB (genericize to "the frameworks/libraries in use").

**agents/orchestrator.md**
- "Governing-artifact surface" section and Visual-approval-loop trigger: `views/**/*.ejs`, `src/public/**`, badge art, guest-/admin-facing copy. SPLIT (the trigger concept, "a pre-review surface glob set gates a live-preview loop", is portable; the concrete glob list is per-repo config supplied by each child repo).
- "Doc-currency step" trigger: `src/db.js`, `src/routes/`, `src/services/` and `README.md`'s "feature claims". SPLIT (path list is wedding-app-specific; the concurrent doc-currency mechanism is portable).
- Model policy section's phase-1 visual carve-out repeatedly cites `views/**/*.ejs`, `src/public/**`. SPLIT same as above.

**agents/orchestrator/dependabot-pr-path.md**
- Final line: "`.claude/rules/dependencies.md` owns the policy summary and the wedding-critical list." SCRUB (rename concept to "critical dependency list", each repo defines its own).

**agents/orchestrator/visual-approval-loop.md**
- Step 1: `npm run preview` (`scripts/preview.js`), the specific `http://localhost:<port>` mechanism. SPLIT (script name/command is per-repo; the "boot a scratch-seeded preview and hand the owner a live link" concept is portable).
- "Edit-scope fence": `views/**` and `src/public/**` literal paths. SPLIT (config, not concept).
- References to `tools/persist-visual-approval.ps1`, `tools/visual-surface.ps1`, `tools/check-visual-approval.ps1` by literal path: portable tool pattern, wedding-specific paths. SPLIT.

**agents/reviewer-security.md**
- "When to invoke" trigger examples: `src/services/photos.js`, `src/routes/auth.js`, `src/app.js`, `/uploads`/`/thumbs` static mounts, `src/routes/admin.js`. SCRUB/SPLIT (the four trigger classes, upload/intake, auth, file-serving, admin, are generic; the file-path examples are wedding-app-specific).
- "Worked example (#196)" entire paragraph, a guest avatar deletion scenario. SPLIT (drop or replace with a generic illustrative scenario).

**.claude/commands/build.md**
- Step 1 "Research": "Node/Express/EJS/better-sqlite3/vitest questions". SCRUB (genericize to "the project's stack").
- Step 2 "Visual-approval loop": `views/**/*.ejs`, `src/public/**`, badge art. SPLIT (path config).
- Steps 3, 6, 7, 8: hardcoded `"C:\Program Files\GitHub CLI\gh.exe"` path (machine-specific, not wedding-domain, but still a scrub target for portability). SCRUB/note as environment config.

**.claude/commands/buildlog.md**
- Depends on `npm run buildlog` / `scripts/buildlog-glue.js`, `buildlog/README.md` shape rules (`shape`, `filename`, `number-mismatch`, `duplicate`, `stub`). SPLIT (the "fold pending fragments into one changelog, refuse if a fold is already in flight" pattern is portable; the specific script/file names are this repo's implementation).

**.claude/commands/post-wave-review.md**
- The narrative body ("wedding scavenger-hunt app going live for real guests on Friday, Aug 7, 2026", "privacy settings and the export, moderation and the feed", `docs/loadtest.md`, hardcoded `C:\wedding-scavenger-hunt` path). SPLIT (rewrite the "situation" framing generically; keep the audit-lens structure, "yesterday's promises / seams / data's future / the record / under load / process itself", which is a portable checklist shape).

**.claude/commands/resume.md**
- Step 4: `docs/north-star.md`, "the four goals every change must serve". SCRUB (genericize to "this repo's own goals doc, if any").
- Step 3's reference to `docs/RESUME-STATE.md` as "historical" is a wedding-repo-specific artifact name. SCRUB.

**.claude/rules/dependencies.md**
- "Wedding-critical prod dependencies" list: `multer, sharp, ejs, better-sqlite3, bcryptjs, archiver, compression`. SPLIT (each child repo defines its own critical-dependency list; the auto/review tiering rule and the native-binary on-host-smoke-test rule are the portable core).

**.claude/rules/visual-surface.md**
- Frontmatter `paths: src/views/**, src/public/**`. SPLIT (config specific to this app's directory layout; the "path-scoped rule points at the pre-review mechanism" pattern is portable).

**.claude/skills/github-write/SKILL.md**
- "Critical: gh path" hardcodes `C:\Program Files\GitHub CLI\gh.exe`. SCRUB (machine-specific; generalize to "resolve the gh path per the repo's own convention").
- Otherwise the issue/PR/commit sync workflow is fully generic.

**tools/apply-branch-protection.ps1**
- `$requiredChecks = @('lint','test','smoke','Analyze (javascript)')`: this repo's actual CI job names. SPLIT (parameterize; the "PUT branch protection with 0 approvals, enforce_admins, replace-not-append payload" mechanism is portable).
- Hardcoded `$gh = 'C:\Program Files\GitHub CLI\gh.exe'`. SCRUB (machine-specific).

**tools/assert-worktree.ps1**
- Header comment example path: `C:/wedding-scavenger-hunt/.git`. SCRUB (comment-only, no functional impact).

**tools/check-deps-parity.ps1**
- Header comment: "a wedding-critical image-processing dependency", `"garden-party-pastels"` (an old project-name string in an example lockfile snippet). SCRUB (comment-only; the parity-check logic is fully generic).

**tools/check-freshness.ps1**
- Header comments reference `C:\wedding-scavenger-hunt`, issue numbers #200/#357 as originating incidents. SCRUB (comment-only; the fetch/overlap/drift logic and `$CARVE_OUT_PATHS`/`$MAX_DRIFT_COMMITS` mechanism are fully generic).

**tools/check-visual-approval.ps1**
- Dot-sources `visual-surface.ps1`, which hardcodes the wedding app's visual-surface globs. SPLIT (the hash-compare-and-name-the-diff mechanism is portable; the surface definition is per-repo config).

**tools/classify-dep-pr-core.ps1**
- `$WeddingCritical = @('multer', 'sharp', 'ejs', 'better-sqlite3', 'bcryptjs', 'archiver', 'compression')`. SPLIT (same list as `.claude/rules/dependencies.md`; the precedence function `Get-DepPrTier` itself is fully portable).

**tools/persist-visual-approval.ps1**
- Dot-sources `visual-surface.ps1` (wedding-specific globs); record schema/mechanism otherwise generic. SPLIT.

**tools/visual-surface.ps1**
- `$VISUAL_SURFACE_GLOBS = @('src/views', 'src/public')`. SPLIT (the SHA256 hash-over-tracked-files mechanism, and the "record path lives outside the hashed set" design, are fully portable; only this one config line is wedding-specific).

**CLAUDE.md**
- "North Star" section and its four lettered goals: entirely wedding-product content. SPLIT (the parent-repo template defines a "north star" placeholder/pointer, not this content).
- "Governance freeze" section: historical, dated, wedding-specific; the concept of a path-list-defined governing-artifact surface is portable, the dated history is not. SPLIT.
- "How work flows" pipeline section: largely portable. GLOBAL-leaning, keep with SCRUB of wedding examples.
- "Repo conventions" bullets: `gh.exe` path (machine-local), `data/`/`.env` gitignore specifics, `config.js` central-config convention (portable pattern, wedding-specific filename), the wedding-specific documentation-pass note. SCRUB/SPLIT per bullet.
- "Dependency updates (Dependabot)" pointer: portable pointer, underlying list is wedding-specific.
- "What needs extra rigor" (commit-msg gate, issue-lifecycle marker): fully portable, GLOBAL-leaning.

## DESIGN.md governance sections (portable rationale worth porting eventually)

The file is dominated by wedding app-feature ADRs (LOCAL). Governance-process sections carrying
portable rationale: "Merge policy: owner-merge boundary retired" (line 305); the two
visual-approval-loop ADRs (317, 342; portable concept, wedding trigger paths); the retired
proof-layer ADRs (516, 530, 548, 633, 727, 753, 769, 809); "Issue-review gate" (558);
"Issue-creation review marker" (572); "Worktree-per-agent isolation (#113)" (585); "Fetch-fresh
worktrees (#357)" (595); "Branch protection on main" (611; check names repo-specific);
"Server-side issue-creation guard (#116)" (656); "Roadmap: board-derived (#139)" (668);
"Planning governance (#140)" (678); "Fable policy (#453)" (688); "Empirical smoke gate (#197)"
(700); "Review-cost overhaul (#201, #218)" (713); "Event mode (#220)" (776; portable
pre-declared expiring review-bypass pattern, wedding-saturated framing); "Coverage floors are a
ratchet (#198, #199)" (833); "Wave governance (#310)" (839); "Merge queue (#404)" (854);
"Sonnet-only run tier (#427)" (872); "Acceptance criteria as a promise (#541)" (894);
"No severity adjudicator (#540)" (902); "System-level change definition" (943); "Security lens
(#222)" (958); "ADR: Governance teardown and freeze (#587)" (967; the single most portable
section, the load-bearing rationale for the lean pipeline); "ADR: Sonnet-only tier reinstated
(#680)" (1032); "ADR: DESIGN.md carved out of the freeze (#707)" (1147).
Everything from roughly line 1169 ("Host checklist") onward, plus feature-level entries, is LOCAL.

## Cross-reference map

- `CLAUDE.md` -> `docs/north-star.md`, `standards/adversarial-review-protocol.md`, `standards/issue-standards.md`, `standards/documentation-standards.md`, `agents/orchestrator.md`, `agents/orchestrator/visual-approval-loop.md`, `.claude/rules/dependencies.md`, `DESIGN.md`, `WHAT-IT-CHECKS.md`, `.githooks/commit-msg`.
- `agents/orchestrator.md` -> `CLAUDE.md` §"Governance freeze", `agents/researcher.md`, `standards/issue-standards.md`, `standards/adversarial-review-protocol.md` (heavily), `agents/reviewer-issue.md`, `agents/implementation-agent.md`, `agents/reviewer-*.md`, `agents/orchestrator/visual-approval-loop.md`, `agents/orchestrator/autonomous-timed-run.md`, `agents/orchestrator/dependabot-pr-path.md`, `.claude/skills/capture-system-defect/SKILL.md`, `standards/decision-heuristics.md`, `standards/agent-standards.md`, `tools/assert-worktree.ps1`, `tools/new-agent-worktree.ps1`, `tools/check-freshness.ps1`, `.claude/commands/realign.md`, `DESIGN.md`.
- `agents/orchestrator/visual-approval-loop.md` -> `agents/orchestrator.md` (stub), `standards/adversarial-review-protocol.md`, `standards/issue-standards.md`, `tools/persist-visual-approval.ps1`, `tools/visual-surface.ps1`, `tools/check-visual-approval.ps1`.
- `agents/orchestrator/dependabot-pr-path.md` -> `agents/orchestrator.md` (stub), `tools/classify-dep-pr.ps1`, `tools/classify-dep-pr-core.ps1`, `.claude/rules/dependencies.md`.
- `agents/orchestrator/autonomous-timed-run.md` -> `agents/orchestrator.md` (stub), `standards/adversarial-review-protocol.md`, `.claude/hooks/loop-gate.ps1`, `.run_state/run.json` (runtime), `standards/decision-heuristics.md`, `.claude/skills/capture-system-defect/SKILL.md`.
- `standards/adversarial-review-protocol.md` -> `DESIGN.md` (teardown ADR), `CLAUDE.md` §"Governance freeze", `agents/orchestrator.md`, `agents/reviewer-*.md` (all), `standards/agent-standards.md`, `standards/issue-standards.md`, `standards/design-philosophy.md`, `.claude/skills/capture-system-defect/SKILL.md`, `buildlog/README.md`.
- `standards/issue-standards.md` -> `standards/adversarial-review-protocol.md`, `agents/orchestrator.md`, `agents/orchestrator/visual-approval-loop.md`, `definition-of-done.md` (repo root), `.claude/commands/realign.md`, `tools/check-freshness.ps1`, `data/wip-issues/357-...md`.
- `standards/design-philosophy.md` -> `standards/design-philosophy-examples.md`, `standards/adversarial-review-protocol.md`, `DESIGN.md` (issue #1172 entry), `tests/comment-budget.test.js`.
- `standards/decision-heuristics.md` -> `CLAUDE.md`, `docs/north-star.md`, `.claude/skills/capture-system-defect/SKILL.md`, `standards/adversarial-review-protocol.md`, `commit-msg`, `tools/setup-hooks.ps1`.
- `standards/edge-case-checklist.md` -> `agents/implementation-agent.md`, `agents/reviewer-pr.md`.
- `standards/agent-standards.md` -> `agents/orchestrator.md` §"Model policy", `standards/issue-standards.md` §"Sonnet tier eligibility", `standards/adversarial-review-protocol.md`.
- All `agents/reviewer-*.md` -> `standards/adversarial-review-protocol.md` (protocol + bias check, universally), and each to its matching standard; `reviewer-issue.md` also -> `definition-of-done.md` + `agents/orchestrator/visual-approval-loop.md`; `reviewer-pr.md` also -> `definition-of-done.md` + `standards/edge-case-checklist.md`; `reviewer-architecture.md` -> `DESIGN.md` + directory listings of `agents/`, `.claude/skills/`, `.agents/skills/`, `standards/`.
- `.claude/commands/build.md` -> `agents/orchestrator.md`, `CLAUDE.md`, `standards/`, `tools/assert-worktree.ps1`, `tools/new-agent-worktree.ps1`, `tools/check-freshness.ps1`, `agents/researcher.md`, `agents/orchestrator/visual-approval-loop.md`, `standards/issue-standards.md`, `agents/reviewer-issue.md`, `agents/reviewer-architecture.md`, `standards/adversarial-review-protocol.md`, `agents/implementation-agent.md`, `agents/reviewer-*.md`, `tools/setup-hooks.ps1`, `data/commitmsg-*.txt`, `WHAT-IT-CHECKS.md`, `buildlog/README.md`.
- `.claude/commands/buildlog.md` -> `agents/orchestrator/visual-approval-loop.md`, `buildlog/README.md`, `scripts/buildlog-glue.js`, `agents/orchestrator.md` (ship flow).
- `.claude/commands/deploy.md` -> `docs/deploy.md`, `tools/deploy.sh`.
- `.claude/commands/post-wave-review.md` -> `standards/issue-standards.md`, `docs/loadtest.md`, `CLAUDE.md`.
- `.claude/commands/realign.md` -> `.claude/commands/post-wave-review.md`, `tools/check-freshness.ps1`, `agents/orchestrator.md` §"Wave boundary", `data/wip-issues/357-fetch-fresh-worktrees-wave-alignment.md`, `agents/reviewer-issue.md`.
- `.claude/commands/resume.md` -> `CLAUDE.md`, `agents/orchestrator.md`, `docs/north-star.md`, `docs/RESUME-STATE.md`, `tools/setup-hooks.ps1`, `buildlog/`, `BUILDLOG.md`.
- `.claude/rules/dependencies.md` -> `tools/classify-dep-pr.ps1`, `tools/classify-dep-pr-core.ps1`, `tests/classify-dep-pr.test.js`, `DESIGN.md`.
- `.claude/rules/visual-surface.md` -> `tools/visual-surface.ps1`, `agents/orchestrator.md` §"Visual-approval loop", `agents/orchestrator/visual-approval-loop.md`.
- `.claude/skills/capture-system-defect/SKILL.md` -> `standards/adversarial-review-protocol.md` §"Finding disposition", `standards/issue-standards.md`.
- `.claude/skills/github-write/SKILL.md` -> `CLAUDE.md` §"Repo conventions", `agents/orchestrator.md`, `standards/issue-standards.md` §"Naming".
- `.githooks/commit-msg` -> `tools/issue-core.ps1`, `WHAT-IT-CHECKS.md`, `CLAUDE.md` §"Governance freeze".
- `tools/apply-branch-protection.ps1` -> `CLAUDE.md` §"Governance freeze", `DESIGN.md` (teardown ADR, "Branch protection on main").
- `tools/check-freshness.ps1` -> `.claude/commands/realign.md` (consumes its constants), `tools/assert-worktree.ps1` (mirrors shape).
- `tools/check-visual-approval.ps1` -> `tools/visual-surface.ps1` (dot-sourced).
- `tools/persist-visual-approval.ps1` -> `tools/visual-surface.ps1` (dot-sourced).
- `tools/classify-dep-pr.ps1` -> `tools/classify-dep-pr-core.ps1` (dot-sourced).
- `tools/new-agent-worktree.ps1` -> referenced by `agents/orchestrator.md`, `.claude/commands/build.md`.
- `tools/setup-hooks.ps1` -> referenced by `.claude/hooks/session-greeting.ps1`, `.claude/commands/resume.md`, `.claude/commands/build.md`.
- `DESIGN.md` -> cross-referenced from nearly every file above as the rationale/history home.

## Hazards (things that break silently if copied unfixed)

- Hardcoded Windows GitHub CLI path `C:\Program Files\GitHub CLI\gh.exe` in `.claude/commands/build.md`, `.claude/skills/github-write/SKILL.md`, `tools/apply-branch-protection.ps1`. Breaks on any machine where `gh` lives elsewhere.
- Repo-specific CI check names in `tools/apply-branch-protection.ps1` (`lint`, `test`, `smoke`, `Analyze (javascript)`): a repo with different CI job names would apply a required-check set that never reports, permanently blocking merges (the file's own header warns about exactly this).
- The critical-dependency list is duplicated in three places (`.claude/rules/dependencies.md`, `tools/classify-dep-pr-core.ps1`, `.github/dependabot.yml` exclude-patterns), kept in sync by `tests/classify-dep-pr.test.js`; copying without the drift-guard test (or a config mechanism) silently breaks the sync guarantee.
- `$VISUAL_SURFACE_GLOBS = @('src/views', 'src/public')` in `tools/visual-surface.ps1`: a repo with a different layout hashes nothing, and an empty glob set still "succeeds".
- `agents/orchestrator.md`'s doc-currency trigger paths (`src/db.js`, `src/routes/`, `src/services/`): in a repo without that layout the step silently never fires.
- Drift-guard tests cited by name throughout (`tests/classify-dep-pr.test.js`, `tests/visual-approval.test.js`, `tests/comment-budget.test.js`) are the enforcement keeping paired definitions in sync; porting the prose without porting or replacing the tests makes the "cannot silently diverge" claims false with no signal.
- `.githooks/commit-msg` requires PowerShell on PATH and dot-sources `tools/issue-core.ps1`: portable, but assumes PowerShell exists even on non-Windows CI.
- `agents/reviewer-architecture.md` and `agents/orchestrator.md`'s periodic audit name `.agents/skills/` as an externally-managed directory excluded from audits; a repo without that directory carries a dangling exclusion.
- `.claude/commands/realign.md` cites `data/wip-issues/357-fetch-fresh-worktrees-wave-alignment.md` by literal path; `data/` is gitignored, so the citation is dead in any clone.
- `tools/check-freshness.ps1`'s `$CARVE_OUT_PATHS = @('BUILDLOG.md')` and `$MAX_DRIFT_COMMITS = 10` are single-homed constants; duplicating the file across repos reintroduces the drift risk its own comment warns against.
- Branch name `main` is assumed throughout (`apply-branch-protection.ps1`, `new-agent-worktree.ps1`, `check-freshness.ps1`, `realign.md`), not parameterized.
- `agents/orchestrator.md`'s Write/Edit scope comment hardcodes this repo's bookkeeping filenames (`buildlog/<N>-<PR>.md`, `BUILDLOG.md`).
- `docs/north-star.md` is referenced as load-bearing (`CLAUDE.md`, `.claude/commands/resume.md`, `standards/decision-heuristics.md`, goal-gate hook prose) but is wedding-specific; ported governance needs an equivalent goals-doc convention or the references dangle.
