# 09-pr-review

Review, fix, re-review until it passes. That loop is normal and fair; most changes take a round or two.

## Who looks

Seat every reviewer as `.claude/agents/orchestrator.md` says. Run each specialist below once, on the working-tree diff (no PR exists until step 11):

- `reviewing-design`: every diff.
- `reviewing-security`: when a check in "When security review runs" below is yes.
- `reviewing-skills`: when a skill or agent file changes.
- `reviewing-docs`: when docs change.
- Every skill named in `lenses` (`repo-profile.json`).

A specialist does not loop. Fix what they raise yourself.

## When security review runs

Any one yes starts it:

- **Strangers.** A changed line lets what another person controls steer something new (a query, command, path, URL, parser, page markup, or a model), or gives another person a new way to start the code, such as a route, a workflow trigger, or a port, even on localhost.
- **Leaving.** Data or actions reach a person, machine or service they could not before.
- **Secrets.** A password, token or key is made, checked, kept or shown differently, or someone's personal data reaches a log, an error, or the repo.
- **Guards.** A permission, an approval, an access check, an input check (escaping, parameterising, a path or size limit), whether a required check or review runs and blocks, or security review itself, is changed or given a way around.

**Another person** is anyone but the user and the repo: a web visitor, every user of a server, someone else's file or page, issue, comment or PR text, a new package or action, a ref from another repo, and a model that has read any of these.

**The repo's own** is what is already merged here, the run's diff, run note and reviewers' replies, the run's issue once owner-approved, and the scene or document the user has open on their own machine.

Any of the repo's own counts as another person's when someone else can write to it. Text that is not already code, such as an issue title or a scene, also does when the change runs it or uses it as a path. A file a model follows is code, run by the model.

Ask of the changed lines, what calls them and what they hand things to, not the whole file. Not sure counts as yes: point to the line and say what you cannot tell. A guard change is a no only when you can name what it refused before and show that nothing new gets through.

Skip, then run:

- Showing a stored name through the page's normal escaping; turning that escaping off.
- Rewording a fixed error message; an error message that now prints a token's value.
- Exporting the open scene to SVG; naming the export file from an object name in it.
- Labelling the run's own issue; letting an agent add `owner-approved` itself.
- Tightening a rate limit; setting `continue-on-error` on a required check.
- Bumping a package already in use; adding a package, or moving a pinned action to a tag.
- Rewording `reviewing-design`; a skill that now reads issue comments.
- Adding a `phone` column to the user table; logging the whole request body.

Write the answer under `## Decisions` in the run note: `Security review: ran, <check>, <file:line>` or `Security review: skipped, <why>`. Ask again when a fix changes the diff; a check firing on a line security review has not read runs it again on those lines, the one exception to "does not loop". Paste this section and that line into the security and PR reviewers' briefings.

## The PR reviewer

Then start one fresh PR reviewer with `reviewing-prs`. Hand it the issue and a neutral summary, not your reasoning: `standards/reviewing.md` § "Independence". Put the specialists' blockers in its briefing; it re-checks each by looking at the code. Add the summary lines of `checkCommands.test` (`repo-profile.json`) run on the reviewed tree, since it has no shell.

Start no review until the issue has a `## Notes` heading, even one saying "none". Put its notes in the briefing, with the run note's `Asked:` lines as written (or "none"), and ask for one ruling line per note (`reviewing-prs`, "Notes on the issue").

On a FAIL, fix every `blocker:` and answer every `question:`, then re-check as `standards/reviewing.md` § "Re-check rounds" says. A finding you contest goes to `refereeing`, once.

## Evidence before a PASS

Put `Reviewed tree: <id>` in each briefing, the id from `npm run check:evidence -- --tree`, and ask the reviewer to repeat it as its reply's first line. Save the reply under `.review_state/` and accept a PASS only if `npm run check:evidence -- <file>` passes. It fails when the code changed after the review or a cited `file:line` does not exist: fix that, then review again.

Run the check on the reviewed tree, before any `minor:` fixes. Those then go in as `standards/reviewing.md` says, with no re-check: that is the standing exception to the id matching.

## Token change

In the governance home, if the measured token change is more than 100 tokens away from the one stated at hand-off, resend the hand-off with the measured number and wait for the owner's yes.
