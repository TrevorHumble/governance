# 05-hand-off

You are about to ask for the owner's time, so make it a short ask. Send one message and wait.

## What the message holds

The `issue-writer` seat drafts it with the `writing-issues`, `writing-user-stories`, and `writing-acceptance-criteria` skills. Send, in this order and in plain words:

```
Title: ...
Story: As ..., I want ..., so that ...
Done when:
1. ...
Token change: a number, or "none". Cut proposed: none, or what and why.
Ok to file?
```

Write for the owner's calls: what users will experience, how it should work, whether to do it at all, and anything that spends money, publishes, deletes the owner's data, or cannot be undone. Leave out the technical how. The models own that, and the owner does not need to read it.

## The token change

Work out the number before you write the message: the tokens this change adds to or removes from the readable tree, as `npm run check:budget` counts them. If the change would push governance over the cap, say what you propose to cut or move to make room. Nothing is cut without the owner's yes.

An approved cut becomes a Done-when line, so it gets checked like any other.

## After you send

Send the message, then stop. Nothing is filed until the owner says yes.

Ask a second time only if the measured token change differs a lot from the number you gave. A small difference needs no second ask.

## When approved words change later

If a criterion changes after the owner said yes, the changed criteria go back to the owner and to one reviewer on the `issue-reviewer` seat. The build does not rely on them until both have seen them.

The yes is recorded at step 06.
