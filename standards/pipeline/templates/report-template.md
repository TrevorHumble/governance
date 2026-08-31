# End-of-run report

Moved from `agents/orchestrator.md` § "How to write the report" and § "Report template". Named
by `standards/pipeline/steps/12-report.md`.

## How to write it

The owner's standing words: **concise and precise.** They are two different tests, and every line
must pass both.

**Concise:** can you cut a word? Cut it. The owner is a functional/business tech, not a developer,
and is often reading this at the end of a long day.

**Precise:** could the owner act on the line without asking a question back? If not, it is too
vague. Add the one missing fact and nothing else.

Agents fail the second test while passing the first. Short and useless is the common failure, not
long.

- Too vague: `Delete: remove the conflicting rule. 20%`
- Too long: `Delete: we could remove the sentence in the protocol standard that restricts briefing
contents to a closed set of two items, which would resolve the contradiction described above and
also shorten the standard by one line. 20%`
- Right: `Delete: cut the "only two things" rule, the fight goes away. 20%`

Size overall: enough to understand, not one word more. Too short and the owner cannot judge it. Too
long and the owner skims, which is worse than not writing it.

**Check for ghosts.** Before proposing any new gate, ask whether the failure it stops has ever
happened. A gate that stops nothing still taxes every issue, forever. The same question is a named
red flag reviewers cite at PR time, `ghost gate` in `standards/design-philosophy.md` § "Red flags";
this paragraph is the report-writing moment of it, not a second rule.

**Go look before you ask.** If a percentage needs a fact the agent does not have, it goes and finds
it. Asking is allowed. Looking is better. Say which one happened.

## The template

The `Fixed:` line appears only when something was fixed in place, and it carries no options: the
problem is gone, so there is nothing left to price. A note with nothing fixed opens at `Saw:` and
carries all four options.

```
Fixed: <what>, because <why>.

Saw: <a short paragraph. What broke, why it matters, and whether it has ever done
real damage. Say plainly when the answer is no.>

Nothing: <the case for leaving it alone>. NN%
Delete: <what of ours comes out>. NN%
Small: <the line or two>. NN%
Big: <the new thing, and its cost>. NN%
```

Add one more line only when it is needed: the thing that blocked the fix, or the one question the
owner must answer before the numbers mean anything. If looking would answer it, look instead.

Worked example, written by the owner on 2026-08-21:

```
Saw: when a reviewer fails something, I send a second one to check the fix. To check it,
I must say what was broken. Another rule says briefings can only hold two things, and
that is not one. So I get flagged every time. Nothing broke. The flag cannot stop a merge.

Nothing: live with one flag per round. Costs zero. 70%
Delete: cut the "only two things" rule, the fight goes away. 20%
Small: one line saying the reviewer gets the code change plus the checklist. 8%
Big: invent a new field, edit 3 files, every repo carries it forever. 2%
```
