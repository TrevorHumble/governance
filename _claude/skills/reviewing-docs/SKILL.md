---
name: reviewing-docs
description: Use when a pull request adds or changes documentation, to check it matches the code and each rule has one home.
metadata:
  reads: 'standards/reviewing.md'
---

# Reviewing docs

Read `standards/reviewing.md` first. Use the five labels, say why each finding matters, and name what held up, as defined there. Then read the doc and the code it describes.

## What to check

1. **It matches the code.** Open the code and compare. A port, command, flag, or path that the code contradicts is a `blocker:`: quote both lines, since a reader who follows the doc gets the wrong result. A command that does not exist is the same.
2. **One home per rule.** A rule the doc copies from another file will drift. Name the owner and say to link to it, a `minor:`.
3. **No filler words.** CI owns the word list; run `npm run check:banned` if you can. Flag a word only by quoting it, as a `minor:`. Do not judge tone by taste.
4. **No FINAL names.** FINAL, LAST, or a similar terminal label in a file name or header is false after the next edit. It is a `minor:`; suggest a version or a date.

## Hold back

A finding is one of the four above, shown by a quotation. New sections, extra steps, version numbers, lint advice, and "you might also document" thoughts are not findings; leave them out. A doc that matches the code and points to the owner of a rule gets `praise:` naming the check it passed, and you say it is ready.

## Your reply

List the findings, each starting with its label. End by saying whether any `blocker:` or `question:` needs a re-check.
