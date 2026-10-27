# Definition of done

A change is finished when every clause holds, not when it merges. The PR reviewer applies these beside the issue's criteria, and an unmet clause is a defect. A child repo may add clauses and may never weaken one.

1. **Failure state.** Every feature says what happens when it goes wrong: bad input, a dropped request, an empty result. The user sees a defined result, not a blank screen. A feature that specifies only the happy path is half a spec.

2. **A way back out.** If a change lets someone create a thing (a comment, an upload, a task), the same change lets them edit or remove it. For anything the change can create, ask whether anyone is trapped (a bad entry stays forever) or only wanting (a nicer way to reorder). Trapped is a defect. Wanting waits for its own issue.

3. **Realistic scale.** Reason about the feature at peak load, not three rows in a dev database. A route that returns every row with no bound looks fine in a test and fails in production.

4. **User undo.** An action a user could plausibly get wrong, such as the wrong file for a task, has an undo or an edit before it goes live. It is not left to a support ticket.

5. **Words match behavior.** The PR description, the issue and the in-app copy say only what the running app does. No placeholder control, no claim about a later PR.

6. **Clean test run.** Tests run on a fresh tree that is current with the default branch, installed with the declared install command (`checkCommands.install` in `repo-profile.json`). CI's result beats a local pass. Every failing test gets a named cause before anyone dismisses it. A test that failed once and then passed is not a clean run.

7. **Recorded omissions.** Anything left out on purpose, such as a deferred behavior, an edge case ruled out or a known limit, is written in the issue or PR with the reason. A reader can tell "we decided not to" from "we did not think of it".

8. **Regressions you caused.** If the change breaks something that worked, fixing it is part of the change. It is not an issue for someone else.

9. **Pre-review signed off.** A change step 04 sent through pre-review is not done until the owner signed off there.

10. **Done means live.** If the last step is a manual one by the owner or on GitHub, such as a repo setting, a required check or a flag, the issue is not done at merge. It is done when the step is taken and the behavior is true in production. At review time, confirm the step is recorded and the issue cannot close ahead of it.
