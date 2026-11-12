# 05-hand-off

You are about to ask for the owner's time, so make it a short ask. File the draft, send one message, and wait.

## What the message holds

Read the `writing-issues`, `writing-user-stories`, and `writing-acceptance-criteria` skills now, and draft it with them. Send, in this order and in plain words:

```
#<N> Title: ...
Story: As ..., I want ..., so that ...
Done when:
1. ...
Hard: yes or no, and why
Token change: a number, or "none". Cut proposed: none, what and why, or a request to raise the cap.
Approve?
```

The first line must start `#<N> Title:` (or `owner/name#<N> Title:` for an issue in another repo) and the message must end `Approve?`: that is how the hook knows what the owner's yes covers. Several issues in one hand-off each get their own `#<N> Title:` line.

Write for the owner's calls, listed in `writing-acceptance-criteria` under "Whose call". Leave out the technical how. The models own that, and the owner does not need to read it.

## Is it hard?

A second look, while the owner is here. You judge it when you draft the message, check it again before you send, and the owner's reply settles it. The test is in `pipeline/PIPELINE.md`. If it is newly hard, say so in the message. "Before step 1" in `pipeline/PIPELINE.md` says what that moves.

## The token change

In a child repo (`governanceHome` is not `self` in `repo-profile.json`), skip this: leave the Token change and Cut proposed lines out of the message. Otherwise, work out the number before you write the message. `writing-issues` says what it means.

An approved cut or cap request becomes a Done-when line, so it gets checked like any other.

## File, then send

If `pipeline/steps/09-pr-review.md` calls for the architecture specialist, run it (`reviewing-architecture`, on the `code-reviewer` seat) on the plan first. Its briefing carries the plan, a neutral summary of the components it adds or changes, the repo's top-level listing (`git ls-tree --name-only HEAD`), and the `DESIGN.md` records the change touches, quoted, if the file is present. Put their notes in the body under "Specialist notes". Fix any `blocker:` there before you file.

```
gh issue create --title "<title>" --body-file <file> --label needs-issue-review
```

A hard issue is filed with `--label hard` as well. The body carries the `Hard:` line as you wrote it; write `Hard: no (owner)` only when the owner said "not hard" themselves. Never file with `owner-approved` or start the body with an approval line: the `before-issue-create` hook refuses both (`WHAT-IT-CHECKS.md`).

Then send the message.

## After you send

Stop. Only a reply that is "approve" (or a near spelling) approves; "ok to file", a question and praise do not. After it, run `gh issue edit <N> -R owner/name --add-label owner-approved` once per issue in the hand-off, as the whole command, with the issue's own repo. The `before-issue-create` hook checks the reply and shows the owner one `Approved:` line per issue; say nothing more about it. If the hook refuses, ask again. Then step 06.

If the owner asks for a change, edit the issue body and resend the whole message.

In the governance home, ask a second time only if the measured token change differs a lot from the number you gave. A small difference needs no second ask.

## When approved words change later

If a criterion changes after the owner's approve, remove the label (`gh issue edit <N> --remove-label owner-approved`) and resend the whole message. The changed criteria then go to one reviewer on the `issue-reviewer` seat, which cannot start until the owner has approved again.
