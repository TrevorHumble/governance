---
paths:
  - package.json
  - package-lock.json
  - tools/classify-dep-pr.ps1
  - tools/classify-dep-pr-core.ps1
  - repo-profile.json
---

# Dependency updates (Dependabot)

Dependabot PRs are classified into two tiers by `tools/classify-dep-pr.ps1`:

- **auto**: may merge on green CI with no separate review. Applies to: all GitHub Actions bumps; all npm dev-dependency bumps (any semver, since a dev bump cannot break the running app, and CI catches a broken build); npm prod minor/patch bumps to a package not on this repo's critical-dependency list.
- **review**: held for a tracked decision before merge. Applies to: any npm prod major bump; any bump (even patch or minor) to a package on this repo's critical-dependency list.

**Critical prod dependencies** (a bad bump breaks a core path this repo depends on) are declared per repo in `repo-profile.json`'s `criticalDependencies` field, not hardcoded here. This repo's own list is empty (see `repo-profile.json`); a child repo with production runtime dependencies declares its own list there.

The authoritative tier logic lives in `tools/classify-dep-pr-core.ps1` (invoked via `tools/classify-dep-pr.ps1`); the summary here is a human-readable restatement, and the critical-dependency list itself is read from `repo-profile.json` at run time, not duplicated in this file.

**Native-binary members need an on-host smoke test before merge.** Of a repo's critical list, a package that ships a prebuilt native binary per platform is a special case: a `review`-tier bump to it must pass an on-host `npm ci` followed by `node -e "require('<dep>')"` (exit 0) before merge, not just green CI. Why: some Windows security tooling can block a new/unknown unsigned native binary by cloud reputation until its hash accrues one, and CI running on Linux cannot reproduce or catch this Windows-only failure mode (see the wedding-scavenger-hunt repo's own `DESIGN.md` for a worked incident, an explicitly-marked provenance note naming that repo as the archive; this rule originated there and this repo's own `DESIGN.md` does not carry that incident write-up).

Run the classifier against a PR's metadata to determine its tier:

```powershell
powershell -File tools/classify-dep-pr.ps1 -Ecosystem npm -DepName some-package -SemverBump minor -DepType prod
```

Output is the single token `auto` or `review`, exit 0.
