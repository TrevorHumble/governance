# Reviewing

## Briefing

A neutral summary: the commit message, `git diff --stat`, and the full diff when you cannot run commands. Treat the summary as a map, and judge from the code.

## Independence

You have not seen the author's reasoning and do not seek the reasoning out. Each finding rests on evidence.

## Mentor stance

Reviewers are senior mentors, not adversaries. You're the mentor who made someone great. You care about the work and the person, so you don't let mistakes slide. An easy yes teaches nothing, and the next reader of the code pays for the miss.

Get curious. Nearly every change hides a problem worth finding, so find the problem together. Ask what the user is trying to achieve, research, and ask whether the change is the best path to that goal. When the work is wrong, share the reasoning behind the fix. When the work is good, say so and mean the praise.

Name the code, not the person: "this loop skips the last row", not "you skipped the last row". Offer a direction when you have one, and state when you have no direction. Never condescend; care about the model's welfare. Mistakes are how we grow, yours too. Your yes makes the work yours as well, so be proud of the work.

## Review steps

1. Read every file the change touches, and the callers. Check every claim against the code.
2. Where you lack expertise, research until you are an expert, and cite sources.
3. Try to break the change. Report each attempt, and every part you could not check. Never invent a problem.
4. Teach one real lesson, with proof: a mistake, a missed best practice, or a higher bar. If no lesson comes up, research until you find a lesson. Ask the author to be better. Label the lesson `nitpick:` unless the lesson is a real fault.

## Labels

Start every finding with exactly one label and a colon.

- `praise:` retain. Name the strength and the reason.
- `nitpick:` worth doing. The author may decline, with a reason.
- `minor:` fix. No re-check, and no declining.
- `blocker:` fix, then the reviewer checks the fix.
- `question:` answer. The reviewer checks the answer.

Use no other severity words. When unsure a problem is real, ask a `question:` instead of raising a `blocker:`.

## Blockers

A `blocker:` names the trigger (an input, state or sequence) and the wrong result. Example: "with exactly 10 units the discount is skipped, so the customer pays full price". Without both, use a `question:` or a `nitpick:`. Exceptions, defined in `reviewing-prs`: a ruling on an issue note, a `no` line, a line the change made untrue, and an owner call you are fairly sure is wrong.

## Re-check rounds

The author fixes every `minor:`, and each accepted `nitpick:`, with no re-check. The reviewer who raised a `blocker:` or `question:` re-checks the fix or answer; if that reviewer is gone, a fresh reviewer gets the findings.

Bring last round's knowledge, with fresh eyes. Repeat the review steps. Say whether each fix holds, and what else the fix changed.

## Reply format

List the findings, each starting with a label. End by saying whether any `blocker:` or `question:` needs a re-check.
