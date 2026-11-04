# End-of-run report

One report, written when the run ends. The owner's standing words: **concise and precise.** They are two different tests, and every line must pass both.

**Concise:** can you cut a word? Cut it. Who the owner is: `AGENTS.md`, "Who you're working with". They are often reading this at the end of a long day.

**Precise:** could the owner act on the line without asking a question back? If not, it is too vague. Add the one missing fact and nothing else.

Agents pass the first test and fail the second. Short and useless is the common failure, not long.

- Too vague: `Fonts: handled.`
- Too long: `Fonts: we decided that since OpenType files are a format some users might have, it made sense to add support for loading them alongside the usual ones.`
- Right: `OTF fonts: built support, users bring them.`

## What goes in

Open with one line: `Moved up: no.` or `Moved up: yes, <why>`. The why is the part of the hard test that applied (`pipeline/PIPELINE.md`), at the start or mid-run. Every report carries it.

The calls the agents made are in the PR body, and the report does not repeat them. The report is two paragraphs or less, in plain words, and says nothing twice.

**For you.** Leave it out when nothing needs the owner. Anything only the owner can decide, and any change parked because it went over a cap while the owner was away. Name the question in a line, then price each option, with a percentage for how likely it is the right pick (they add up to 100):

```
Should shared lists be public by default?

Private: users share one list at a time. Costs one setting. 70%
Public: every list is visible at once. Costs a privacy fix later. 20%
Ask on first use: costs a screen every new user sees. 10%
```

A price is what the option costs: tokens, files, time, or money. If you need a fact to name it, go and look; say whether you looked or asked.

## Nothing on your own initiative

A note stays on the issue unless step 12 sends it up. Do not file an issue, label, or PR about it on your own initiative; the owner decides whether it becomes work. The pipeline's own calls, such as labels and the PR, are not this.
