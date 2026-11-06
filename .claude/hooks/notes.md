# Hook notes

## before-issue-create

This command names issue creation, so it is judged as a filing: {why}. File an issue one way: gh issue create --label {label} --body-file <file>, or in a cloud session gh api repos/{owner}/{repo}/issues -f title=T -f 'labels[]={label}' -F body=@<file>, where the file's first line is '{line}'. The owner's yes comes first: send the hand-off (pipeline/steps/05-hand-off.md) and wait for it. Text that only mentions issue creation belongs in a file written with the Write tool (then git commit -F <file>, --body-file) or a Grep tool search.

## edit-gate

Nothing changes until the owner starts the work. {what} Ask him to type /build, or /buildlog, /rca, /realign or /resume. Reading and read-only commands still run.

## goal-check

The owner's answer stands. Before the next question, check the goals and standards/deciding.md first.

## after-edit

You edited {path}, which docs describe. Check they still match the code.

## before-stop

2 paragraphs or less is a message, 4 is an essay.

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

hello: Hooks here nudge; only issue filing, agent spawns, and edits and non-read-only commands before the owner types /build are denied. Seats: seats.json.
githooks: Git hooks: commit-msg is {commitMsg}, pre-commit is {preCommit}.
githooks-kept: A custom core.hooksPath is kept.
githooks-missing: No .githooks/commit-msg here.
githooks-elsewhere: This is not a repo root, so nothing was set.
env: {name} is set and overrides the seats.
fork: Fork mode is on, so reviewers may not start in front. Set CLAUDE_CODE_FORK_SUBAGENT to 0 in the env block of .claude/settings.json.
cap: maxEffortLevel {cap} is below the {role} seat's effort ({effort}).
marker: .run_state/hard exists, so spawns need the hard tag.
