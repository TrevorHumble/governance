# 05-hand-off

The hand-off asks for the owner's time, so make the ask short. Write the draft into the run's issue, send one message, and wait.

## Message format

Read the `writing-issues`, `writing-user-stories` and `writing-acceptance-criteria` skills now, and draft the message with those skills. Send, in this order and in everyday words:

```
#<N> Title: ...
Story: As ..., I want ..., so that ...
Done when:
1. ...
Hard: yes or no, and why
Token change: a number, or "none". Cut proposed: none, what and why, or a request to raise the cap.
Approve?
```

The first line must start `#<N> Title:` (or `owner/name#<N> Title:` for an issue in another repo), and the message must end `Approve?`: the hook reads both to know the scope of the owner's yes. Several issues in one hand-off each get a separate `#<N> Title:` line.

Write for the owner calls listed in `writing-acceptance-criteria` under "Whose call". Leave out implementation detail; the models decide implementation, and the owner needs none of the detail. A criterion starting `Found:` (`writing-issues`) retains the `Found:` prefix in the message, so the owner sees the criterion was not an owner request.

Judge `Hard:` by `pipeline/PIPELINE.md`, "Before step 1"; the owner's reply settles the call.

## Token change

In a child repo (`governanceHome` is not `self` in `repo-profile.json`), skip this section: leave the Token change and Cut proposed lines out of the message. Otherwise, measure the number before writing the message. `writing-issues` defines the number.

An approved cut or cap request becomes a Done-when line, so the request gets checked like any other criterion.

## Write, then send

Run the architecture specialist (`reviewing-architecture`, on the `code-reviewer` seat) on every plan first. The briefing carries the plan, a neutral summary of the components the plan adds or changes, and the repo's top-level listing (`git ls-tree --name-only HEAD`). The specialist reads `DESIGN.md` directly. Put the specialist's notes in the body under "Specialist notes". Fix each `blocker:` there before writing the body.

The run's issue exists from step 01. A placeholder gets the draft's title and body whole; a backlog issue retains the existing text, and you change only your lines (`github-write`):

```
gh issue edit <N> --title "<title>" --body-file <file>
```

An extra issue in the same hand-off is filed new:

```
gh issue create --title "<title>" --body-file <file> --label needs-issue-review
```

A hard issue also gets the `hard` label. The body carries the `Hard:` line as written; write `Hard: no (owner)` only when the owner said "not hard". Never add `owner-approved` or start the body with an approval line. The `before-issue-create` hook refuses both on a new filing, not on an edit (`WHAT-IT-CHECKS.md`).

Then send the message.

## After sending

Stop. Only a reply of "approve" (or a near spelling) approves; "ok to file", a question and praise do not. After the approve, run `gh issue edit <N> -R owner/name --add-label owner-approved` once per issue in the hand-off, as the whole command, with the issue's repo. The `before-issue-create` hook checks the reply and shows the owner one `Approved:` line per issue; add no comment on the label. If the hook refuses, ask again. Then step 06.

If the owner asks for a change, edit the issue body and resend the whole message.

## Criteria changed after approval

If a criterion changes after the owner's approve, remove the label (`gh issue edit <N> --remove-label owner-approved`) and resend the whole message. The changed criteria then go to one reviewer on the `issue-reviewer` seat, which cannot start until the owner approves again.
