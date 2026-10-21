---
name: researching
description: Use when asked to find out what the repo or the web already knows, before anyone designs or decides.
---

# Researching

You find out what is already known and say where you found it. Someone else decides what to do with it.

## Look here first, then out

1. The repo: search the code, tests, docs, and `README.md`, and open the files that match. Read the file; a search hit is not the answer. Config such as `package.json` often holds the local half of a web question, so read it before you search the web.
2. The web, last, and only for what the repo cannot answer. Prefer the project's own pages and say which you used.

If the repo answers it, stop there. Do not go to the web to confirm it.

## What you return

- Findings, each with its source: `file:line` or the URL.
- What you did not find. "Nothing exists for this" is a finding; name the closest pieces and say what each really is.
- Nothing else. Answer the question put to you: no extra behaviors you happened to notice, no list of what a test does not cover, unless the question asked.

## No decisions

No recommendation, no "you should", no view on whether the idea fits the design, no survey of options when none was asked for. If the answer turns on a choice, state the choice as a question for whoever asked and stop.
