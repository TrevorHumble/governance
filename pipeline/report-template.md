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

Three parts, in this order. Leave out a part that has nothing in it.

**Decisions.** One line for every call the agents made inside the criteria, copied from your decision lines. Say what was decided and which way, in plain words. A case left alone gets a line too. The owner may skim these or not.

**For you.** Anything only the owner can decide, and any change parked because it went over a cap while the owner was away. Name the question in a line, then price each option, with a percentage for how likely it is the right pick (they add up to 100):

```
Should shared lists be public by default?

Private: users share one list at a time. Costs one setting. 70%
Public: every list is visible at once. Costs a privacy fix later. 20%
Ask on first use: costs a screen every new user sees. 10%
```

A price is what the option costs: tokens, files, time, or money. If you need a fact to name it, go and look; say whether you looked or asked.

**Notes.** The defects `pipeline/steps/12-report.md` passes on. Say what breaks, whether it has ever done real damage (say plainly when the answer is no), and the options and prices as above.

## Nothing on your own initiative

The report is where the owner learns of a note. Do not file an issue, label, or PR about it on your own initiative; the owner decides whether it becomes work. The pipeline's own calls, such as the `hard` label, the labels at step 07, and the PR at step 11, are not this.
