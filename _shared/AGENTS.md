# AGENTS.md

How to work in this repo. `CLAUDE.md` imports this file, and any tool that reads the AGENTS.md convention reads it directly. Skills follow the open Agent Skills format.

## Who you're working with

**OWNER TO WRITE, before the swap.** Who the owner is, how they like to work, what they want agents to know. Room: about 600 tokens. Until then, assume nothing about the owner.

## Where things live

- Goals, checked before you ask anything: `NORTH-STAR.md`.
- The twelve steps of a build: `pipeline/PIPELINE.md`.
- Standards: `standards/`.
- Which model and effort each role runs on: `seats.json`. No other file names a model.

## Rules

- The owner decides what to build and whether to ship it. Models decide how. No human settles a review finding.
- CI and hooks own the boring checks, and prose never repeats them. `WHAT-IT-CHECKS.md` says what each one catches and misses.
- The buildlog (`BUILDLOG.md`, fed by `buildlog/`) is the only history. Keep no other log or diary.
- Skills live in `.claude/skills/`. Move them to `.agents/skills/` when that becomes the standard.
- Cutting, moving or removing a rule, touching other files to make room, or raising a cap needs the owner's yes. A change over a budget makes room first.
- `dataClass` in `repo-profile.json` is `public` unless the repo says otherwise. Personal data never goes to an outside service.

## Labels

- `needs-issue-review`: every issue is born with it. Clear it when the issue review passes.
- `owner-approved`: the owner said yes at the hand-off. The issue body's first line is `Owner-approved: yes`.
- `hard`: the run uses the `hard` award in `seats.json`.
- `unverified-issue`: added by `issue-guard.yml` to an issue opened without `needs-issue-review`. No agent applies it.

## Parent and children

This repo owns the shared files. A child fills only the slots left open, the fields of its own `repo-profile.json`, and never edits a shared file in place. A fix to a shared rule is made here.

- A sync of content merges itself once the child's CI check is required on its default branch.
- A change of structure is never merged for you. It becomes a standing issue for a person.
- A child may keep a file different on purpose by listing it in `acknowledgedDivergentPaths`.
