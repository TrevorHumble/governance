# 07-issue-review

Start one fresh reviewer on the `issue-reviewer` seat, with the `reviewing-issues` skill. Hand it the issue and nothing of your own reasoning: `standards/reviewing.md` § "Independence".

On a FAIL, fix every `blocker:` and answer every `question:`, then re-check as `standards/reviewing.md` § "Re-check rounds" says. Handle each label as that section says. If a fix changes a criterion, it goes back to the owner first: step 05.

On a PASS, clear the label:

```
gh issue edit <N> --remove-label needs-issue-review
```

If any round's reply ended in an `AWARD cheaper-seats` line and the issue now passes, also run:

```
gh issue edit <N> --add-label cheaper-seats
```
