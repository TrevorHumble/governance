---
name: reviewing-docs
description: Use when a pull request adds or changes documentation, to check it matches the code and each rule has one home.
metadata:
  reads: 'standards/reviewing.md standards/writing.md'
---

# Reviewing docs

Read `standards/reviewing.md` first. Use the five labels, say why each finding matters, and name what held up, as defined there. Then read `standards/writing.md` and the doc, and open the code the doc describes.

## What to check

1. **It matches the code.** A port, command, flag, or path that the code contradicts is a `blocker:`, because a reader who follows the doc gets the wrong result. A command that does not exist is the same. Quote the doc and the code, as `standards/writing.md` says under "A finding quotes its evidence".
2. **One home per rule.** A rule the doc copies from another file will drift. Name the owner and say to link to it, a `minor:`.
3. **No filler words.** `standards/writing.md` under "Filler words"; CI owns the list. A `minor:`.
4. **No FINAL names.** `standards/writing.md` under "Names". A `minor:`.

## Hold back

A finding is one of the four above, shown by a quotation. New sections, extra steps, version numbers, lint advice, and "you might also document" thoughts are not findings; leave them out. A doc that matches the code and points to the owner of a rule gets `praise:` naming the check it passed, and you say it is ready.

## Your reply

List the findings, each starting with its label. End by saying whether any `blocker:` or `question:` needs a re-check.
