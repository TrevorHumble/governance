# CLAUDE.md: operating rules for this repo

Behavioral rules for any AI agent working in this repository. This file is this repo's own
operating contract, not a restatement of any child repo's local rules.

## What this repo is

This is the parent governance repo: standards, agent definitions, pipeline commands, hooks and
their wiring, worktree tools, and the checks that enforce them, scrubbed of any one child
project's domain content and with every repo-specific value moved into `repo-profile.json`. It
exists so a canonical, generic, running governance tree can be pulled into child repos: the pull
is mechanized by `tools/governance-sync.ps1`, and the merge-on-green rule a content-classed sync
PR follows is `standards/governance-sync.md`. See `DESIGN.md` for the founding rationale and
`README.md` for the federalism rules.

## Governing-artifact surface

The governing-artifact surface, the files a change to which counts as a governance change and
routes through the normal pipeline like any other change, is exactly:

`.githooks/`, `tools/`, `scripts/`, `standards/`, `agents/`, `.claude/`, `.github/`, `CLAUDE.md`,
`AGENTS.md`, `governance-manifest.json`, and `repo-profile.json`.

This is the one home for that list: every other file in this repo that needs to refer to "the
governing-artifact surface" points here rather than repeating or paraphrasing it.

## How work flows: the orchestrator pipeline

All changes go through an enforced pipeline. Do not commit code straight to the default branch
and do not skip steps. The steps live in `standards/pipeline/PIPELINE.md`. No file asserts which
ship mode any particular repo runs; this repo's own profile declares `"shipMode": "pr"`.

**Pre-review step.** A repo may declare its own pre-review process in its `repo-profile.json`'s
`preReview` field (for example a live visual-approval loop, or `"none"`). When declared, it runs
before the issue is drafted, except where that process file's unchanged-artifact exemption applies;
full mechanics are owned by `standards/pipeline/steps/04-pre-review.md`, and the exemption by
`standards/pipeline/edge/unchanged-artifact-exemption.md`, not restated here. This
repo's own profile declares `"preReview": "none"`.

**Owner hand-off.** Before the issue is filed, the owner receives the title, the user story,
and the acceptance criteria as one short message and approves them; full mechanics are owned by
`standards/issue-standards.md` § "Owner hand-off", not restated here.

## Model policy

Every spawned agent sets its `model` explicitly; never rely on a default that may escalate
silently. Role tiers, the `sonnet-only` exception, the Fable policy, and the Gemini / Antigravity
mapping are all authoritative in `standards/pipeline/templates/model-tiers.md`. The
Pre-review-surface carve-out stays authoritative in `agents/orchestrator.md` § "Model policy".

## Adversarial review

Every artifact ships only after independent, hostile-by-default review with evidence-backed
findings and no human in the loop to resolve them. Full protocol, cadence, and dispatch rules:
`standards/adversarial-review-protocol.md`.

## Documentation split

Per `standards/documentation-standards.md`, keep `README.md` (getting started and reference for
humans), `CLAUDE.md` (behavioral rules for the agent operating in this repo), and `DESIGN.md`
(architecture decisions, rationale, tradeoffs) separate; do not mix them. No FINAL / LAST /
TRULY_FINAL in filenames or headers. No AI-slop filler (`elegantly`, `robustly`, `seamlessly`,
`comprehensively`, `leverages`, `powerful`, and the rest of the banned list in the standards).

## Federalism (global vs. child repos)

This repo is the global source of truth for governance. The rules, settled by the owner:

- **Global wins by default.** A child never edits its own local copy of a parent-owned file; the
  ownership wall (`standards/ownership-map.md`) forbids it, so the one path to changing a global
  rule is changing it here. Full mechanics: `standards/governance-sync.md`.
- **Governance fixes are made here**, in this repo, even when discovered mid-build in a child.
  Full review runs here.
- **Children pull on build.** Every child checks this repo for updates at build start. A
  content-classed pull lands as a small PR in the child and merges itself on green CI, no
  reviewer, once the child's declared CI guard is confirmed required on its default branch. Full
  mechanics, and what the pull mechanizes and what it cannot force: `standards/governance-sync.md`
  § "What the tool mechanizes and what it cannot force".

## Repo conventions

- **GitHub is the single source of truth** for tasks (issues) and docs. Status is canonical on
  the board.
- **The GitHub CLI path** is declared in `repo-profile.json`'s `ghPath` field (default `gh`,
  meaning on PATH). A machine where `gh` lives elsewhere records its absolute path as a
  per-machine note in that machine's own `CLAUDE.local.md`, never in the committed profile, and
  sets the `GH_PATH` environment variable to match: `tools/governance-sync.ps1` reads the
  committed `ghPath`, then `GH_PATH`, then the vendor default install location, in that order
  (`ghPath` alone cannot reach a machine where `gh` lives elsewhere).
- **Environment is Windows / PowerShell** for this repo's own tooling. Use PowerShell syntax
  (`$env:VAR`, `$null`, backtick line continuation; no `&&` / `||`) in any script here; a
  cross-platform launcher fallback (`pwsh`) is used where tests need to run on other CI
  platforms.
- **Secrets and runtime state are gitignored:** `data/`, `node_modules/`, `.review_state/`,
  `.run_state/`, and the per-machine `CLAUDE.local.md`. Never commit them.
- **Config is central.** Repo-specific values live in `repo-profile.json`; a shared file that
  needs one defers to it rather than asserting its own value. Do not hardcode a path, branch
  name, check command, or dependency list elsewhere.
- **Pipeline labels.** The ported standards and pipeline require nine GitHub labels on this
  repo: `needs-issue-review`, `ready`, `backlog`, `spawned-in-run`, `sonnet-only`,
  `severity:blocker`, `severity:major`, `severity:minor`, `unverified-issue`. `gh label create`
  provisions all nine, and for the first eight it must run before the pipeline's first
  `gh issue create --label` or `gh issue edit --add-label` call needs them. `unverified-issue` is
  the exception on the applying side, not the creating side: no pipeline call ever applies it;
  `.github/workflows/issue-guard.yml` applies it at runtime, to an issue opened without
  `needs-issue-review`. Dependabot separately auto-creates `dependencies`, `javascript`, and
  `github_actions` on its first pull request; those are not pipeline labels and are not counted in
  the nine. A tenth label shape, the per-run `active-<N>-*` claim label (its exact form owned by
  `standards/issue-standards.md` § "The file claim and the size rule"), is not provisioned up
  front and is not counted in the nine either: it is created per-run when an issue's review
  passes, renamed at each re-stamp, and deleted when the run releases its files, per that
  section.
- **Local governance convention.** Every child repo (and this repo itself, on any given machine)
  keeps its own gitignored `CLAUDE.local.md` for per-machine notes only (a local gh path, other
  machine-specific values); a fresh worktree never contains it, so nothing a build needs to act on
  belongs there. A retained-divergent path a child means to keep on purpose is declared in the
  child's own tracked `repo-profile.json` instead, under `acknowledgedDivergentPaths`: see
  `standards/governance-sync.md` § "The retained-divergent rule".

## What needs extra rigor

**Issue-reference gate:** every code commit must name a GitHub issue; `.githooks/commit-msg`
blocks a commit that stages a non-`.md` file and names none (`(#N)`, a closing keyword, or an
`issue-N` branch). This is a cheap, mechanical check; it does not itself verify that a review
happened. See `WHAT-IT-CHECKS.md` for the honest description of what review coverage actually is
right now.

**Issue lifecycle marker:** new issues are born carrying the `needs-issue-review` label (applied
at `gh issue create` time). The label is cleared after a PASS on the issue review, via
`gh issue edit <N> --remove-label needs-issue-review`.
