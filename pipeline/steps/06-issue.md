# 06-issue

File only after the owner's yes from step 05. Use the words the owner approved.

```
gh issue create --title "<title>" --body-file <file> --label needs-issue-review --label owner-approved
```

Make the first line of the body `Owner-approved: yes`. The `before-issue-create` hook stops a filing that lacks the `needs-issue-review` label or that line. A hard issue (step 05) is filed with `--label hard` as well. The body carries the hand-off's `Hard:` line, including a "no" the owner gave.

If the change adds or restructures a component, run the architecture specialist (`reviewing-architecture`, on the `code-reviewer` seat) on the plan before you file. Its briefing carries the plan, a neutral summary of the components it adds or changes, and the repo's top-level listing (`git ls-tree --name-only HEAD`). Put their notes in the body under "Specialist notes". Fix any `blocker:` there before you file. The issue reviewer checks the fix at step 07.
