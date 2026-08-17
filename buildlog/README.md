# buildlog/: pending per-ship entries

This folder holds one file per shipped issue, waiting to be folded into `BUILDLOG.md`. It exists
so two concurrent build sessions never write the same shared file at once (the wedding-scavenger-hunt
repo's issue #1184); each session writes its own new fragment, which can never collide with
another session's.

## Filename

`<N>-<PR>.md`, where `N` is the GitHub issue number and `PR` is the pull request number, for
example `42-107.md`. Both are plain digits, no leading text. `N` must match the line's own
`#N` (see below); the fold rejects a mismatch as `number-mismatch`. Only that one number is
cross-checked between filename and entry line: the entry line's own `PR #M` is not compared
against the filename's `PR` component, so keeping those two in agreement is the author's own
responsibility, not something the fold verifies. An issue that ships more than once produces a
new, distinct filename each time, because `PR` differs, so a repeat ship can never collide with
its own earlier fragment.

## Contents

Exactly one line, in the shape:

```
- YYYY-MM-DD - #N <summary> (PR #M). <evidence, recorded omissions, CI expectation>
```

The parenthetical closes the summary clause; it does not end the entry. Carry the substance a
`BUILDLOG.md` entry has always carried: what shipped, why, what review found, what CI confirmed.
A title-only stub is not an entry. `scripts/buildlog-glue-core.js` enforces a 200-character
minimum on this line by default (`foldFragments`'s `minEntryLength` option, overridable only for
a test fixture); a shorter line is refused as `stub` and the fold does not proceed on it.

A fragment of more than one line is not rejected for that alone. Only the first line is
validated against the shape above; the rest is appended whole. One line is the convention here,
not an enforced ceiling.

## Formatting

The file must be formatted per this repo's declared check commands (see `repo-profile.json`'s
`checkCommands` field; `.prettierrc.json` sets `endOfLine: auto`) and end with a trailing
newline. No em dash, in any form: `scripts/check-emdash.js` gates every added line here, on the
fragment's own change PR. That is the gate that holds; the fold PR that later moves this line into
`BUILDLOG.md` does not gate it again, because `scripts/check-emdash-core.js` exempts a line that is
removed in one place and re-added identically elsewhere in the same diff, which is exactly what a
fold's diff looks like: the fragment file's line is removed, the archive's added line is the same
text.

## What does not belong here

Some `BUILDLOG.md` entries name no single shipped issue, and keep writing directly to
`BUILDLOG.md`: a `[HALT]` entry (the work was not committed), a wave-completion note, an
`[AUDIT]` entry, a pre-review occurrence record (recorded before a PR, let alone a fragment,
exists), and board-hygiene or multi-ship run summaries. `scripts/buildlog-glue.js`'s fold excludes
`README.md` (this file) from the fragment glob; it is the folder's own contract, not a pending
entry.
