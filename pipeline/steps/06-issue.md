# 06-issue

File only after the owner's yes from step 05. Use the words the owner approved.

```
gh issue create --title "<title>" --body-file <file> --label needs-issue-review --label owner-approved
```

Make the first line of the body `Owner-approved: yes`. The `before-issue-create` hook stops a filing that lacks the `needs-issue-review` label or that line.

If the change adds or restructures a component, run the architecture specialist on the plan before you file (`09-pr-review.md` says how). Put their notes in the body under "Specialist notes". Fix any `blocker:` there before you file. The issue reviewer checks the fix at step 07.
