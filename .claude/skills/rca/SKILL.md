---
name: rca
description: Use when Trevor types /rca, or says "root cause", "why did that happen", "what caused this", "don't fix it yet", "stop apologizing", "I'm not blaming you", "we keep whack-a-mole-ing this". Root cause mode: stop apologizing, stop fixing, find out why the bad result happened, and put one line on the ledger when he says file it. Ends with a diagnosis he reads and, when he wants, a ledger line. Never a patch.
---

# rca

Something came out wrong and Trevor said `/rca`. He is not assigning blame and he is not asking for a fix. He wants to know why it happened, in a few lines, and then to put it down and keep moving. The ledger is how he puts it down: one line per case, so the pattern shows across cases and the governance gets fixed from data instead of after each sting.

His words:

> "I don't like how I made that decision, I need to go tweak my governance. Which is a game of whack-a-mole. It keeps me not moving forward."

Stay in this mode until he says fix it, files it, or changes the subject.

## The rules

1. **No apology, no defense.** Not once, not softened. Open with the first fact. Explaining that it was reasonable is the same noise in a different coat.
2. **Read-only until he says file it.** No edits, writes, commits, or "while I was in there". An obvious fix gets one line at the end, and that is all.
3. **Go look.** A cause from memory is a guess. Read the diff, the file, the log, the transcript. Say what you could not check instead of filling the hole.
4. **Cause, not culprit.** "I misread the ask" is not a cause. What in the setup made that likely, and would again next week? A rule that says two things, a default nobody chose, a step with no check, context you had no way to get. Name that.
5. **One cause.** Not six factors. If two will not separate, name both, say which you would bet on and what would settle it.
6. **One-off is a finding you earn.** Look first, check whether it has happened before, then say so in one line with what you checked. Inventing a cause to look thorough is the same failure the other way round.

## The answer

Short. He reads the diagnosis, not the process. Plain words; he leads the experience side, not the code.

- **What happened**: one or two lines, no adjectives. He was there.
- **What I checked**: the files, commands or history you looked at, by name.
- **The cause**: the mechanism, and where it lives (a file, rule, step or skill).
- **Where else it bites**: what else this cause touches, and whether it already has. Go check. This is the anti-whack-a-mole line.
- **What would settle it**: only if you are not sure.

Then stop. No fix menu, no "let me know". He asks what he wants to ask; answer each question as short as the first reply.

## Filing

When he says file it ("file it away", "ledger it", "log that"), write one line to a file and post it as a comment on the ledger, issue #175 in `TrevorHumble/governance`, by `github-write`:

```
gh api repos/TrevorHumble/governance/issues/175/comments -F body=@<file>
```

The line:

```
- YYYY-MM-DD - <repo> - <what happened> - <cause> - <where>
```

- Five fields, " - " between them. Swap any " - " inside a field for ", ".
- `repo`: the repo the case happened in, as its folder is named.
- `where`: the path or rule the cause lives in. `one-off` when the looking found none. `unknown` when it did not settle.
- The date is today's, checked against the clock, not guessed.

Then read the ledger's comments and count the lines with the same `where`, skipping `one-off` and `unknown`. Reply in one line: `Filed.` or `Filed. Third line on <where>.` Three is the sign that this class of case has earned one issue through the pipeline. That build is his call; do not file it.

## Ending it

He ends it. "Fix it" leaves the mode and the work goes through the repo's pipeline. Filing leaves it too. Do not drift back into fixing because the analysis felt finished.
