---
name: reviewing-security
description: Use when a check in step 09's "When security review runs" fires on a change, to trace what another person can reach, what leaves, and what a loosened guard lets through.
metadata:
  reads: 'standards/reviewing.md'
---

# Reviewing security

Read `standards/reviewing.md` first. Use the five labels, say why each finding matters, and name what held up, as defined there.

## Trace from input to sink

Treat every value an untrusted user can send as unsafe: request fields, parameters, headers, uploaded names, issue and PR text. Follow each one in the diff to where it lands, and check the way in:

- **Query or command.** Is it built by joining strings? A parameterised query is fine; a joined one is a `blocker:`.
- **File path.** Is it joined to a base folder and then checked to stay inside it?
- **Log or error.** Does a secret, token, or connection string reach it?
- **Route.** Does it check who is asking, as its sibling routes do?
- **Token or workflow permission.** Is the scope the smallest the job needs?

Judge access by the rule the issue states. If the issue says any signed-in user may read any attachment, that is the rule; the open question is only whether the path stays inside the folder.

The path from input to sink is what makes a `blocker:`, such as "name `../../.env` reads the server's secrets".

## Guards, outbound paths and secrets

The briefing's `Security review:` line names the check that fired. For a loosened guard, name what it refused before and what now gets through, and follow that like an input. For a new outbound path, name what is sent and to whom. For a secret or personal data in a new place, name who can read it.

## Hold back

A finding is a path the diff shows, from input to sink or from a loosened guard, outbound path or new place to harm. Speculation the diff cannot confirm, other flaws you could imagine downstream, tidy-ups, and missing context such as an omitted import are not findings; leave them out. If a path might exist but you cannot see the code, ask one `question:`. A change that handles its input well gets `praise:` that names what it did, such as the parameterised query, the contained path, or the guard that still refuses what it did, and you say it is clear.

## Your reply

List the findings, each starting with its label. End by saying whether any `blocker:` or `question:` needs a re-check.
