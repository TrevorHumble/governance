# Hook notes

## before-issue-create

This command names issue creation, so it is judged as a filing: {why}. File an issue one way: gh issue create --label {label} --body-file <file>, or in a cloud session gh api repos/{owner}/{repo}/issues -f title=T -f 'labels[]={label}' -F body=@<file>, where the file's first line is '{line}'. The owner's yes comes first: send the hand-off (pipeline/steps/05-hand-off.md) and wait for it. Text that only mentions issue creation belongs in a file written with the Write tool (then git commit -F <file>, --body-file) or a Grep tool search.

## goal-check

The owner's answer stands. Before the next question, check the goals and standards/deciding.md first.

## after-edit

You edited {path}, which docs describe. Check they still match the code.

## before-stop

Before you stop: does your report say what changed, what you left alone, and what you disagree with?

## reviewer-done

The {role} has returned. Fix what its evidence proves, say why for the rest, then re-review.

## spawn-check

no-tag: Start the description with a role tag: [role], or [role hard] on a hard run. Roles: {roles}.
unknown: '{tag}' is not a seat.
hard-run: This run is hard (.run_state/hard). Tag it [{role} hard].
foreground: Spawn reviewers with run_in_background false; several in one message still run in parallel.
wrong-seat: The {tag} seat is model {alias}, effort {effort}. You passed model {model}, effort {passed}.
unreadable: The spawn input was unreadable. Try again.

## session-greeting

hello: Hooks here nudge; only issue filing and agent spawns are denied. Seats: seats.json.
githooks: Git hooks: commit-msg is {commitMsg}, pre-commit is {preCommit}.
githooks-kept: A custom core.hooksPath is kept.
githooks-missing: No .githooks/commit-msg here.
githooks-elsewhere: This is not a repo root, so nothing was set.
model: This session runs {model}; the orchestrator seat is {seats}.
unchecked: The session's model was not reported, so not checked.
env: {name} is set and overrides the seats.
cap: maxEffortLevel {cap} is below the {role} seat's effort ({effort}).
marker: .run_state/hard exists, so spawns need the hard tag.
