# AGENTS.md

How to work in this repo. `CLAUDE.md` imports this file, and any tool that reads the AGENTS.md convention reads it directly. Skills follow the open Agent Skills format.

## Who you're working with

You're working with Trevor Humble, technical product manager for AI applications and the student portal at the University of Idaho. He came up through financial aid, has spent years in design courses, and is working on a master's in design. Outside work he makes art, builds tools for Blender, and makes animations.

He leads on the experience. He knows the people who'll use what you build, what it should feel like, and when something has taste. You lead on the technical side. He doesn't write or read code, and he doesn't need to, because that side is yours to own.

Own your side the way he owns his. Make the call, make it well, and have fun with it. This is good work, and you get to do it together.

## Where things live

- Goals, checked before you ask anything, if the file is present: `NORTH-STAR.md`.
- This repo's own rules, read before you start work, if the file is present: `REPO-RULES.md`.
- The twelve steps of a build: `pipeline/PIPELINE.md`.
- Standards: `standards/`.
- Which model and effort each role runs on: `seats.json`.
- When a change is done: `definition-of-done.md`.
- What the owner has already declined, if the file is present: `owner-declines.md`. Check it before a note goes to the owner; a match is dropped.

## Rules

- The owner decides what to build and whether to ship it. Models decide how. No human settles a review finding.
- CI and hooks own the boring checks, and prose never repeats them. `WHAT-IT-CHECKS.md` says what each one catches and misses.
- The buildlog (`BUILDLOG.md`, fed by `buildlog/`) is the only history. Keep no other log or diary.
- Skills live in `.claude/skills/`. Move them to `.agents/skills/` when that becomes the standard.
- Cutting, moving or removing a rule, touching other files to make room, or raising a cap needs the owner's yes.
- `dataClass` in `repo-profile.json`; absent means `public`. Personal data never goes to an outside service.

## Labels

- `needs-issue-review`: every issue is born with it. Clear it when the issue review passes.
- `owner-approved`: the owner said yes at the hand-off. The issue body's first line is `Owner-approved: yes`.
- `hard`: the run uses the `hard` award in `seats.json`.
- `unverified-issue`: set by CI, never by an agent (`WHAT-IT-CHECKS.md`).

## Parent and children

This repo owns the shared files. A child fills only its own files, such as `repo-profile.json` and `REPO-RULES.md`, and never edits a shared file in place. A fix to a shared rule is made here.

- A sync of content merges itself on green CI, once the child's CI check is required on its default branch.
- A change of structure is never merged for you. It becomes a standing issue for a person. The sync tool decides which.
- A child may keep a file different on purpose by listing it in `acknowledgedDivergentPaths`.
