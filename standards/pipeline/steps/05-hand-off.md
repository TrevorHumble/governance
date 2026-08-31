# 05: Hand-off

Before `gh issue create` runs, send the owner one message: the title, the user story, and the
acceptance criteria, in that order, nothing else. Use the written format in
`standards/pipeline/templates/hand-off-format.md` every time. Wait for explicit approval before
writing anything to GitHub.

Rare case: a child inheriting an approved epic's approval takes no hand-off of its own. See
`standards/issue-standards.md` § "Owner hand-off" for the inheritance rule and its exact-string
guard.

Sizing note: "small" here means one agent session. An agent's own estimate of what fits in a
session runs low, so a story is not split merely because it feels large.

The approval is recorded once the issue exists, per the issue step. A change to any approved word
afterward, the title, the story, or a criterion, follows the return path in
`standards/issue-standards.md` § "Owner hand-off": the approval marker is removed the moment the
text changes, and the message is re-sent.

If the operator's environment defines an attention signal for blocked-on-owner moments, fire it
first; the signal is the operator's own machine configuration, not this tree's. The hand-off text
is the last thing in the turn: no tool call and no further text follow it in the same turn.
