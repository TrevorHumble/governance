# Ownership Map Standard

**As any agent working in the parent or a child, I need one shipped, checkable statement of who
owns every governance route so that the no-review sync is safe by separation instead of by a
reviewer.**

**Scope:** every governance route between the parent governance repo and any child repo that
syncs from it. This map itself ships into every child via `standards/**`; wherever it is read,
parent tree or child tree, "parent" and "child" name the two fixed roles this file defines, not
the tree the reader happens to be standing in. A repo's own product surface, whatever it builds
and ships as its actual product, is outside the map on purpose.

---

What makes the pull-on-build sync safe without a per-sync review is a hard wall between owners,
not a reviewer's judgment call; this map is that wall's definition. `governance-manifest.json`'s
`sharedPaths`, `classes`, `classesDefault`, `arrivesAsStructure`, `repoProfileFields`, and
`shelfRoots` fields are the machine-readable form of most of the routes this file states in
prose. Two prose routes have no `sharedPaths` entry of their own: the parent's own tests of its
own tools resolve to an `excludedPaths` entry for the parent's `tests/**`, not a shared file, and
the repo-profile.json field list resolves to `repoProfileFields` rather than a file path. The
procedural rules further below (the reference rule, the redirect rule, the CLAUDE.md leash) are
stated in prose only; no manifest field encodes them, and none encodes one further rule either: the
structural override on edits to `governance-manifest.json`'s `sharedPaths`, `excludedPaths`, and
`retired` arrays, defined in "Change classes" below. A consumer built from `classes`,
`classesDefault`, and `arrivesAsStructure` alone cannot derive that override; reading this map is
the only way to learn it exists. Among the procedural rules below, the shelf rule is the exception:
its four roots are encoded by `shelfRoots`.

---

## Routes by path class

**Parent owns:** the structure itself; the review process (`standards/`, the reviewer and
pipeline agents including the orchestrator's playbook sub-tree, the five pipeline commands
`/build` `/buildlog` `/post-wave-review` `/realign` `/resume`); `.githooks/`; its three named
pipeline hooks under `.claude/hooks/` (the directory itself is split ownership, see below); the
repo-level rule files it ships (`.claude/rules/dependencies.md`, `AGENTS.md`,
`definition-of-done.md`, `buildlog/README.md`, `.gitattributes`); the ownership manifest itself
(`governance-manifest.json`), shipping to every child read-only; the enumerated tool and script
files the manifest names, never the `tools/` or `scripts/` directories as such; its two named
pipeline skills under `.claude/skills/` (the directory itself is split ownership, see below); its
own tests of its own tools; and the field list and per-field schema (name and type) of
`repo-profile.json`.

**Child owns:** the values in `repo-profile.json`; pre-review, including its implementation
scripts; CI shape (`.github/`); critical paths and critical dependencies; deploy/build machinery
wherever it sits, including any command file outside the parent's five named pipeline commands;
product skills (`skills/` in every child; `.claude/skills/` is split ownership, see below); its
own toolchain and bookkeeping files (`package.json`, `package-lock.json`, lint/format configs,
test-runner config, `.gitignore`, `.claude/settings.json`, `.claude/launch.json`,
`WHAT-IT-CHECKS.md`, `BUILDLOG.md`, `LICENSE`, and any child-only tools); its own tests; its own
docs (`CLAUDE.md`, `DESIGN.md`, `README.md`) under the leash below.

---

## Split-ownership directories

Four directories split ownership by named file rather than by directory:

- `.claude/commands/`: the parent owns exactly its five named pipeline commands; every other
  command file is the child's.
- `.claude/rules/`: the parent owns exactly `.claude/rules/dependencies.md`.
- `.claude/skills/`: the parent owns exactly its two pipeline skills; a child may add its own
  skills there and owns them.
- `.claude/hooks/`: the parent owns exactly its three named pipeline hooks; a child may add its
  own Claude Code hooks there and owns them.

`.githooks/` is deliberately not on this list and stays a blanket glob: the parent owns the
commit-time pipeline outright, the manifest ships no named child file under it. Every one of the
four directories above that is on this list is enumerated rather than globbed for the opposite
reason: the manifest already ships named files under each, so a file a child adds there is
child-owned in fact, and a glob would sweep it into the parent-owned set, locking a child out of
its own hook or its own skill on every branch but a sync branch.

---

## Parent-owned paths inside split-ownership directories

- `.claude/commands/build.md`
- `.claude/commands/buildlog.md`
- `.claude/commands/post-wave-review.md`
- `.claude/commands/realign.md`
- `.claude/commands/resume.md`
- `.claude/rules/dependencies.md`
- `.claude/skills/capture-system-defect/SKILL.md`
- `.claude/skills/github-write/SKILL.md`
- `.claude/hooks/goal-gate.ps1`
- `.claude/hooks/loop-gate.ps1`
- `.claude/hooks/session-greeting.ps1`

---

## Standard shelves

Four roots, same path in every child, even when empty: `docs/` (pre-review doc), `tools/`
(pre-review implementation scripts), `scripts/` (deploy/build machinery), `skills/` (product
skills).

The profile, `repo-profile.json`, sits at the repo root as a named slot, not a shelf directory.

**The shelf rule.** A shelf root is never a `**` entry in `sharedPaths`. A parent-owned file that
happens to live under a shelf root is enumerated in `sharedPaths` one path at a time and gets no
`excludedPaths` entry, so it lands in exactly one list. A shelf root the parent tracks files under
but owns none of carries a `**` entry in `excludedPaths` instead. A shelf root the parent has no
files under at all needs no entry in either list. The four shelf roots get a machine-readable home
in the manifest (`shelfRoots`) so a test can check the rule instead of a reader remembering it.

---

## The reference rule

A parent-owned rule file may reference a child-owned profile value without owning it.

---

## The CLAUDE.md leash

A child's `CLAUDE.md` holds repo facts and slot values only, never a restated or rewritten parent
rule, except the sections parent-owned machinery points at, which this list makes checkable:

- `## Governance overrides`
- `## Governing-artifact surface`
- `## Model policy`
- `## Repo conventions`

Without the carve-out the leash would order a child to delete the only home an override may live
in, the heading the sync tool checks for, and the sections that parent-owned, synced files send a
reader to. The list is not left as a hand inventory: a derived check scans every `sharedPaths`
file for a `CLAUDE.md` section citation and fails when the cited title is missing from this list.

---

## Change classes

The merge procedure for a synced PR belongs to `standards/governance-sync.md` alone; this section
states classes only, never merge mechanics.

A **content** change edits what a parent-owned file says without changing where anything lives or
what any repo must itself do.
A **structure** change moves ownership, moves a path, or requires the receiving repo to change
something the parent does not own.

A path the manifest's `classes` sidecar does not name is treated as structure, never as content:
the safe side, since an unclassified path is one nobody has judged.

A class is a property of a change, but `classes` is keyed by path, and those two things come apart
on a path's first delivery into a child: arriving obliges that child to do something the parent
does not own (adopt a new law, add a CI job, wire a new hook), which is structural on first
delivery even when every later change to that same path is ordinary content. The manifest's
`arrivesAsStructure` sidecar names exactly those paths, so a consumer of the classification treats
a planned file as structure when it is absent in the receiving child and named there, even though
`classes` calls it content once adopted.

Editing `governance-manifest.json`'s path arrays (`sharedPaths`, `excludedPaths`, `retired`) is
structural regardless of the edited path's own `classes` value, because the edit itself moves
ownership: adding or removing a path from those arrays changes who owns that path, not merely what
a parent-owned file says. Adding or removing a path in this map's own "Parent-owned paths inside
split-ownership directories" section is the prose form of the same act, and is structural for the
same reason.

---

## The redirect rule

Changing what you do not own means the change goes to the owner's repo, never a local edit. How it
gets there depends on who is acting: the owner files it; an agent that finds it mid-run carries it
as a report note and hands it to the owner at end of run, per `agents/orchestrator.md` § "No agent
files its own issue", which stays the one home of that rule. The redirect rule routes the change;
it never authorizes an agent to open a row on its own initiative.
