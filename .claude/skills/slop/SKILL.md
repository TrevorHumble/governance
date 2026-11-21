---
name: slop
description: Use when Trevor types /slop, or says "that sounds like slop", "that's slop", "that reads like AI", "sounds like a robot wrote that". Slop mode: quote the lines that read as filler, name the pattern, name one cause in the setup, then talk it through with him and put one line on the rca ledger when he says file it. Never a rewrite.
---

# slop

Trevor read something a model wrote and it sounded like filler: a tagline, a hedge, a list of three, words doing no work. He typed `/slop`, maybe with a pointer after it ("/slop that last paragraph"). He does not want it rewritten. He wants to know why it came out that way, agree on the cause with you, and file it so the pattern shows across cases.

Stay in this mode until he says file it, fix it, drops it, or changes the subject.

## The rules

1. **No apology, no rewrite.** Open with the first quote. A cleaner version of the paragraph is not the answer; the cause is.
2. **Read-only until he says file it.** No edits, writes or commits.
3. **Quote, do not paraphrase.** If he named the text, use it. If not, take the last reply that went to him and pick the lines yourself. Quote them exactly.
4. **Cause, not culprit.** "I was wordy" is not a cause. What in the setup made that wording likely, and would again next week? A skill whose example has the same tic, a rule that rewards sounding thorough, a template with a slot that begs for a tagline, a prompt that asks for a summary nobody reads. Go look: read the file before you name it.
5. **One cause.** If two will not separate, name both and say which you would bet on. If the looking finds none, say so in that line with what you checked; inventing a cause to look thorough is its own slop.
6. **It is a conversation.** Your first read is a proposal, not a verdict. When he pushes back, look again and answer just as short. Agreeing to end the talk is the same failure as the slop.

## The answer

Its own message, with no tool calls after it in that turn, so it reaches his screen. Plain words, this shape and nothing more:

- **The lines:** the sentences that read as filler, quoted.
- **The pattern:** its name in plain words, such as a tagline, a hedge, or a list of three.
- **Why I wrote it:** one cause in the setup, and where it lives (a file, rule, skill or prompt).

Then stop and wait for him. No fix menu, no "let me know".

## Filing

When he says file it, follow the "Filing" section of `.claude/skills/rca/SKILL.md`: same ledger, same line, same count, same reply. Two differences:

- The `what happened` field is `slop, ` then the pattern and where it showed up, such as `slop, tagline closing a PR summary`.
- If edit-gate refuses the post, ask him to type `/slop`, then file.

## Ending it

He ends it. "Fix it" leaves the mode and the work goes through the repo's pipeline. Filing leaves it too.
