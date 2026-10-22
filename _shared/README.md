# governance

The parent governance repo. It holds the pipeline, the standards, the agents, the skills, the hooks and the checks that every repo of ours builds under. Child repos pull it in; this repo is the one place a shared rule changes.

For agents: `AGENTS.md`. For why things are the way they are: `DESIGN.md`.

## Adopting it in a child repo

Set these in the child's `repo-profile.json`:

- `governanceHome`: the URL or path of this repo. This repo itself says `self`.
- `governanceRef`: the tag or branch to pull. Without it, sync pulls the default branch.
- `syncIssue`: the number of the child's standing issue for governance syncs.

Then run `tools/governance-sync.ps1` at build start. `tools/setup-hooks.ps1` turns on the git hooks in a fresh clone.

## Commands

```
npm install
npm test
npm run lint
npm run format:check
npm run check:budget
npm run check:banned
npm run check:emdash
npm run check:seats
npm run check:evidence
npm run check:served
npm run check:design
```

`npm run format` fixes what `format:check` flags. `WHAT-IT-CHECKS.md` says what each check catches and misses.

## Where things live

- `AGENTS.md`, `CLAUDE.md`: the rules for agents.
- `NORTH-STAR.md`: the owner's goals.
- `DESIGN.md`: the design records.
- `definition-of-done.md`, `owner-declines.md`: when a change is finished, and what the owner has already declined.
- `pipeline/`: the twelve steps and the report template.
- `standards/`: shared standards.
- `.claude/`: skills, agents, hooks and settings.
- `seats.json`: each role's model and effort.
- `repo-profile.json`, `governance-manifest.json`: this repo's values, and which files a child receives.
- `tools/`, `scripts/`, `.githooks/`, `.github/`: the machinery.
