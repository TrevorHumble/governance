# 09-pr-review

Review, fix and re-review until the change passes. The loop is normal and fair; most changes take one or two rounds.

## Reviewers

Seat every reviewer per `.claude/agents/orchestrator.md`. Run each specialist below on the working-tree diff (no PR exists until step 11):

- `reviewing-design`: every diff.
- `reviewing-architecture`: every diff, on the built code, with the big-file list from `node scripts/check-file-size.js --worktree`.
- `reviewing-security`: when a trigger in "Security review triggers" below is yes.
- `reviewing-skills`: when a skill or agent file changes.
- `reviewing-docs`: when docs change.
- Every skill named in `lenses` (`repo-profile.json`).

Fix each specialist finding. A specialist who raised a `blocker:` or `question:` re-checks the fix or answer, per `standards/reviewing.md` § "Re-check rounds"; otherwise each specialist reviews once.

## Security review triggers

Any one yes starts security review:

- **Strangers.** A changed line lets input another person controls steer a new sink (a query, command, path, URL, parser, page markup, or a model), or gives another person a new entry point, such as a route, a workflow trigger, or a port, even on localhost.
- **Leaving.** Data or actions reach a person, machine or service with no access before the change.
- **Secrets.** A password, token or key is created, checked, stored or displayed differently, or personal data reaches a log, an error, or the repo.
- **Guards.** A permission, an approval, an access check, an input check (escaping, parameterising, a path or size limit), whether a required check or review runs and blocks, or security review itself, is changed or bypassed.

**Another person** is anyone but the user and the repo: a web visitor, every user of a server, a third party's file or page, issue, comment or PR text, a new package or action, a ref from another repo, and a model that has read any of these sources.

**Repo content** is the merged code, the run's diff, run note and reviewer replies, the run's issue once owner-approved, and the scene or document open on the user's machine.

Repo content counts as another person's input when someone else can write to the content. Non-code text, such as an issue title or a scene, also counts when the change runs the text or uses the text as a path. A file a model follows is code, run by the model.

Judge the changed lines, the callers, and the callees, not the whole file. Uncertain counts as yes: cite the line and the open question. A guard change is a no only when you can name the input refused before and show no new input gets through.

Skip, then run:

- Showing a stored name through the page's normal escaping; turning that escaping off.
- Rewording a fixed error message; an error message printing a token's value.
- Exporting the open scene to SVG; naming the export file from an object name in the scene.
- Labelling the run's issue; letting an agent add `owner-approved`.
- Tightening a rate limit; setting `continue-on-error` on a required check.
- Bumping a package in use; adding a package, or moving a pinned action to a tag.
- Rewording `reviewing-design`; a skill that starts reading issue comments.
- Adding a `phone` column to the user table; logging the whole request body.

Write the answer under `## Decisions` in the run note: `Security review: ran, <check>, <file:line>` or `Security review: skipped, <why>`. Ask again when a fix changes the diff; a trigger firing on a line security review has not read runs security review again on those lines. Paste this section and the `Security review:` line into the security and PR reviewers' briefings.

## PR reviewer

Then start one fresh PR reviewer with `reviewing-prs`. Hand over the issue and a neutral summary, not your reasoning: `standards/reviewing.md` § "Independence". Put the specialists' blockers and re-checks in the briefing. Add the summary lines of `checkCommands.test` (`repo-profile.json`) run on the reviewed tree, since the reviewer has no shell.

Start no review until the issue has a `## Notes` heading, even a heading over "none". Put the notes in the briefing, with the run note's `Asked:` lines verbatim (or "none"), and ask for one ruling line per note (`reviewing-prs`, "Issue notes").

On a FAIL, fix every `blocker:` and answer every `question:`, then re-check per `standards/reviewing.md` § "Re-check rounds". A contested finding goes to `refereeing`, once.

## Review evidence

Put `Reviewed tree: <id>` in each briefing, the id from `npm run check:evidence -- --tree`, and ask the reviewer to repeat the id as the reply's first line. Save the reply under `.review_state/` and accept a PASS only if `npm run check:evidence -- <file>` passes. The check fails when the code changed after the review or a cited `file:line` does not exist: fix the cause, then review again.

Run the check on the reviewed tree, before any `minor:` fixes. Those fixes then go in per `standards/reviewing.md`, with no re-check: the standing exception to id matching.

## Token change

In the governance home, if the measured token change differs from the hand-off number by more than 100 tokens, resend the hand-off with the measured number and wait for the owner's yes.
