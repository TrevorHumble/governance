# 05-hand-off

You are about to ask for the owner's time, so make it a short ask. Send one message and wait.

## What the message holds

The `issue-writer` seat drafts it with the `writing-issues`, `writing-user-stories`, and `writing-acceptance-criteria` skills. Send, in this order and in plain words:

```
Title: ...
Story: As ..., I want ..., so that ...
Done when:
1. ...
Hard: yes or no, and why
Token change: a number, or "none". Cut proposed: none, what and why, or a request to raise the cap.
Ok to file?
```

Write for the owner's calls, listed in `writing-acceptance-criteria` under "Whose call". Leave out the technical how. The models own that, and the owner does not need to read it.

## Is it hard?

A second look, while the owner is here. The `issue-writer` seat judges it when it drafts the message, you check it before you send, and the owner's reply settles it. The test is in `pipeline/PIPELINE.md`. If it is newly hard, ask the owner to switch the session as that section says. If the owner says not hard after the session switched at the start, they may switch back.

## The token change

Work out the number before you write the message. `writing-issues` says what it means.

An approved cut or cap request becomes a Done-when line, so it gets checked like any other.

## After you send

Send the message, then stop. Nothing is filed until the owner says yes.

If the owner says no or asks for a change, revise and resend the whole message. Nothing is filed meanwhile.

Ask a second time only if the measured token change differs a lot from the number you gave. A small difference needs no second ask.

## When approved words change later

If a criterion changes after the owner said yes, the changed criteria go back to the owner and to one reviewer on the `issue-reviewer` seat. The build does not rely on them until the owner has said yes and the reviewer has passed them.

The yes is recorded at step 06.
