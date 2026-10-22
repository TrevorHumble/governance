# 06-issue

File only after the owner's yes from step 05. Use the words the owner approved.

```
gh issue create --title "<title>" --body-file <file> --label needs-issue-review --label owner-approved
```

Start the body with the owner-approved line (`AGENTS.md`, Labels). The `before-issue-create` hook checks the filing (`WHAT-IT-CHECKS.md`). A hard issue (step 05) is filed with `--label hard` as well. The body carries the hand-off's `Hard:` line as the drafter wrote it. Write `Hard: no (owner)` only when the owner overrode the drafter or said "not hard" themselves.

Run the architecture specialist (`reviewing-architecture`, on the `code-reviewer` seat; when: `pipeline/steps/09-pr-review.md`) on the plan before you file. Its briefing carries the plan, a neutral summary of the components it adds or changes, and the repo's top-level listing (`git ls-tree --name-only HEAD`). Put their notes in the body under "Specialist notes". Fix any `blocker:` there before you file. The issue reviewer checks the fix at step 07.
