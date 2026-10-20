---
name: writing-acceptance-criteria
description: Use when writing or changing the "Done when" list of an issue.
---

# Writing acceptance criteria

The owner brings the vision and approves the criteria. You turn the vision into criteria that say what the user should be able to do. Get them right, because later agents will reason from them.

## What one looks like

A plain "Done when" sentence, yes or no. Check it by looking at something, or by running a named command. No Given/When/Then.

- Yes: "The page shows the saved recipe's title." "`npm run check:budget` passes."
- No: "feels fast", "root cause documented", "tests cover it", "no duplicated logic remains". Say what someone would see instead, or drop it.

## Carry the intent

Make the first criterion the story's why, as something to look at. The rest serve it. An agent who meets a case nobody listed can then decide from that line.

## Name the failure

Where the change can fail, one criterion says what fails or is refused, and what the user sees.

## Keep it small

Three to six criteria. Add no design the owner did not ask for (approval records, retries, offline, duplicates) unless the story needs it. Before adding a case, check whether a criterion already covers it; two that say the same thing become one.

## Whose call

The owner decides what users experience, workflows, taste, whether to do something at all, and anything that spends money, publishes, deletes the owner's data, or cannot be undone. Write those from the owner's words, and send any change to one back to them. Everything technical inside a criterion is yours to decide.
