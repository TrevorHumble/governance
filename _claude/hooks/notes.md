# Hook notes

`{x}` is filled in by the hook.

## before-issue-create

This command names issue creation, so it is judged as a filing: {why}. File an issue one way: gh issue create --label {label} --body-file <file>, where the file's first line is '{line}'. The owner's yes comes first: send the hand-off (pipeline/steps/05-hand-off.md) and wait for it. Text that only mentions issue creation belongs in a file written with the Write tool (then git commit -F <file>, --body-file) or a Grep tool search.

## goal-check

Your goals and standards/deciding.md usually settle this. Check them, then decide and act. Ask only when the call is the owner's alone: money, credentials, publishing, deleting data.

## after-edit

You edited {path}, which docs describe. Check they still match the code, and fix any that drifted.

## before-stop

Before you stop: does your report say what changed, what you left alone, and what you disagree with?

## reviewer-done

The {role} has returned. Fix what its evidence proves, say why for the rest, then send the fix back to review.

## spawn-check

no-tag: Start the description with a role tag: [role], or [role hard] on a hard run. Roles: {roles}.
no-award: {role} has no hard award.
hard-run: This run is hard (.run_state/hard). Tag it [{role} hard].
wrong-seat: The {tag} seat is model {alias}, effort {effort}. You passed model {model}, effort {passed}. Use the seat's values.

## session-greeting

hello: Hooks here nudge; only issue filing and agent seats are denied. Seats: seats.json.
model: This session runs {model}; the orchestrator seat is {seats}. Restart on a seat's model.
unchecked: The session's model was not reported, so it was not checked.
env: {name} is set and overrides the seats.
cap: maxEffortLevel {cap} is below the {role} seat's effort ({effort}).
