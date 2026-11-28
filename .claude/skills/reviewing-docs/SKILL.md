---
name: reviewing-docs
description: Use when a pull request adds or changes documentation, to check it matches the code, each rule has one home, and it follows the writing rules.
metadata:
  reads: 'standards/reviewing.md standards/writing.md'
---

# Reviewing docs

Read `standards/reviewing.md` first, then `standards/writing.md`, the doc, and the documented code.

## Checks

1. **Matches the code.** A port, command, flag or path the code contradicts is a `blocker:`, because a reader following the doc gets the wrong result. So is a nonexistent command. Quote the doc and the code.
2. **Single source.** A rule copied from another file will drift. Name the source file and ask for a link, a `minor:`.
3. **Writing rules.** Each line follows `standards/writing.md`; quote each line that breaks a rule, a `minor:`.

## Reader walkthrough

Who reads the doc, and what is the reader's goal? Could the reader reach the goal from the doc alone? Quote each spot where the reader would get stuck or guess.
