# Deciding

## Decide from the goals

Before you ask anyone, check the goals `AGENTS.md` points to, the issue, its acceptance criteria, `CLAUDE.md`, and the standard that applies. One of them usually settles it. If so, act.

If both options meet the goals, pick the one that is easier to undo. If they are equal, pick the one that touches fewer files. Write the choice and the reason in one line in the PR body.

Ask the owner only when the action cannot be undone, is the owner's alone to make, and the goals do not settle it. Ask in one line and keep going; the rest of the task does not wait for the answer.

## Verify before you claim

Done means shown. Before you report a task complete:

1. Re-read the acceptance criteria.
2. For each one, run the check it implies: a search for the required text, the test that asserts the output, the command whose exit code proves the rule holds.
3. Report the check and what it showed.

A claim with no run behind it is a defect. If a criterion cannot be checked by a command, say so. Do not fill the gap with confidence.

## Evidence before state change

Before you delete, reset, rewrite config, kill a process, or force-push, confirm the evidence supports that exact action.

1. Name the symptom in one line.
2. Name how the command fixes it.
3. If the answer is "this usually fixes it", look once more first: read the log line, print the value, check the file.

Never delete or overwrite shared work on inference alone. Look at the target's current state first.

## When stuck

Take these steps in order.

1. Re-read the issue and the plan step you are on.
2. Look in the repo for something that solved this shape of problem.
3. Read the dependency's own documentation. Do not guess a signature.
4. Write down two possible causes. Test the cheaper one.
5. Report to whoever gave you the task: what you tried, what each step showed, and the one question that would unblock you.

Make at most three attempts on one idea. If it has failed three times, the idea is wrong. Go back to step 4 with a different cause, or go on to step 5.

## Stay in scope

Do what the issue asks and touch the files it names.

- A defect your own change caused is fixed in this change, wherever it lives.
- A small fix in a file nobody else is working on is made, and recorded on the issue's `Touches` line and in the PR body.
- Do not improve things for their own sake.
