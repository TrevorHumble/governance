# 06: Issue

**If the run was handed an existing GitHub issue,** read it and its local draft; skip creation.
Otherwise, open the GitHub issue first: `gh issue create --label needs-issue-review`, plus any
tier label, using the gh CLI at the path `repo-profile.json`'s `ghPath` field declares (default
`gh`, on PATH; a machine where `gh` lives elsewhere records the absolute path in that machine's own
`CLAUDE.local.md`, never committed). Capture the assigned number `N`. If the create call fails,
stop and surface the error rather than proceeding without a number.

Then write the local draft as `data/wip-issues/<N>-slug.md`, per `standards/issue-standards.md`:
user story, acceptance criteria, implementation plan, dependency map. GitHub is the single source
of truth from the moment the issue exists: the board reflects the task from creation.

**Record the hand-off approval.** Immediately after the `**Type:**` line, on its own line, record
the approval carried from the hand-off step: the exact line `Owner-approved: yes`. Write it in both
the GitHub issue body and the local draft, per `standards/issue-standards.md` § "Owner hand-off".

Rare case: an epic skips the implement, artifact-review, commit, and ship steps and closes when its
last child merges; what makes an issue an epic: `standards/issue-standards.md` § "The file claim
and the size rule".
