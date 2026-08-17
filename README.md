# governance

The parent governance repo. The constitution.

Global standards, agent definitions, pipeline rules, and hooks live here and sync out
to every child repo (wedding-scavenger-hunt, the Blender repos, and whatever comes next).

Rules of the road, settled 2026-08-16:

- **Global wins by default.** A child may override a global rule only by declaring it
  in its own local override file, naming the rule and the reason. The global file itself
  is never edited in a child.
- **Governance fixes are made here**, in this repo, even when discovered mid-build in a
  child. Full review runs here.
- **Children pull on build.** Every child checks this repo for updates at build start.
  A pull lands as a small PR in the child with one lightweight review asking only:
  does the new global rule contradict a local rule? No contradiction: merge. One clear
  fix: fix and merge. Multiple ways to fix: stop and ask the owner.

Seed content comes from wedding-scavenger-hunt, the gold standard at the time this repo was
created (2026-08-16). See `docs/seed-classification-2026-08-16.md` for the file-by-file
classification that produced this tree, and `DESIGN.md` for the full rationale.

## Getting started

```
npm install
npm test
node scripts/check-emdash.js
```

`tools/setup-hooks.ps1` wires the local `.githooks/commit-msg` gate into a fresh clone.

## Where things live

- `CLAUDE.md`: the operating rules an AI agent working in this repo follows (the pipeline, the
  governing-artifact surface, the federalism rules above stated as law, repo conventions).
- `repo-profile.json`: this repo's own declared values for every field a shared governance file
  may need (pre-review process, CI check names, critical dependencies, default branch, and the
  rest). Schema documented in `DESIGN.md`.
- `governance-manifest.json`: the declared set of files a child repo is meant to receive on a
  future sync, and any retired tombstones. Schema documented in `DESIGN.md`.
- `DESIGN.md`: architecture decisions and rationale, including the founding ADR for this repo.
- `standards/`, `agents/`, `.claude/`, `.githooks/`, `tools/`, `scripts/`: the governance layer
  itself.
