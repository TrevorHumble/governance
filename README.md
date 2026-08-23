# governance

The parent governance repo. The constitution.

Global standards, agent definitions, pipeline rules, and hooks live here and sync out
to every child repo (wedding-scavenger-hunt, the Blender repos, and whatever comes next).

Rules of the road, settled 2026-08-16:

- **Global wins by default.** A child overrides only by declaring it in its own tracked override
  home, never by editing the global file. Full mechanics, including where that home lives:
  `standards/governance-sync.md`.
- **Governance fixes are made here**, in this repo, even when discovered mid-build in a
  child. Full review runs here.
- **Children pull on build.** Every child checks this repo for updates at build start.
  A pull lands as a small PR in the child with one lightweight review. Full mechanics,
  including the review's operative question and its outcomes: `standards/governance-sync.md`.

Seed content comes from wedding-scavenger-hunt, the gold standard at the time this repo was
created (2026-08-16). See `docs/seed-classification-2026-08-16.md` for the file-by-file
classification that produced this tree, and `DESIGN.md` for the full rationale.

## Goals

- **One canonical governance home.** Standards, agent definitions, pipeline commands, hooks, and
  worktree tools live in exactly one place instead of a separate copy per repo.
- **Zero drift across child repos.** A child pulls updates from here instead of maintaining its
  own diverging fork of the governance layer.
- **Every improvement lands once.** A fix or a new rule discovered in any child's work is made
  here, in this repo, and reaches every other child through the same sync path, rather than being
  patched locally and never propagated.

## Getting started

```
npm install
npm test
npm run lint
npm run format:check
npm run check:emdash
```

If `format:check` fails, `npm run format` rewrites the flagged files in place.

`tools/setup-hooks.ps1` wires the local `.githooks/` gates, `commit-msg` and `pre-commit`, into a fresh clone.

## Where things live

- `CLAUDE.md`: the operating rules an AI agent working in this repo follows (the pipeline, the
  governing-artifact surface, the federalism rules above stated as law, repo conventions).
- `repo-profile.json`: this repo's own declared values for every field a shared governance file
  may need (pre-review process, CI check names, critical dependencies, default branch, and the
  rest). Schema documented in `DESIGN.md`.
- `governance-manifest.json`: the declared set of files a child repo receives on sync, and any
  retired tombstones. Schema documented in `DESIGN.md`.
- `tools/governance-sync.ps1`: pulls this repo's declared shared governance into a child, and
  classifies what it finds as content or structure against `governance-manifest.json`. A
  content-classed change ships as a small PR; a structure-classed change ships no PR and opens a
  standing issue in the child instead, for a human to sequence by hand. The contradiction review a
  child's reviewer runs on a content PR: `standards/governance-sync.md`.
- `DESIGN.md`: architecture decisions and rationale, including the founding ADR for this repo.
- `standards/`, `agents/`, `.claude/`, `.githooks/`, `tools/`, `scripts/`: the governance layer
  itself.
