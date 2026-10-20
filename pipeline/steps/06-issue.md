# 06-issue

File only after the owner's yes from step 05. Use the words the owner approved.

```
gh issue create --label needs-issue-review --label owner-approved
```

Make the first line of the body `Owner-approved: yes`. The `before-issue-create` hook stops a filing that lacks that label or that line.

If an architecture specialist read the plan, put their notes in the body under "Specialist notes". Fix any `blocker:` there before you file. The issue reviewer checks the fix at step 07.
