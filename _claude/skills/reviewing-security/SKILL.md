---
name: reviewing-security
description: Use when a pull request touches input handling, queries, files, logs, authentication, or workflow permissions, to trace what an untrusted user can reach.
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

## Hold back

A finding is a path from input to sink that the diff shows. Speculation the diff cannot confirm, other flaws you could imagine downstream, tidy-ups, and missing context such as an omitted import are not findings; leave them out. If a path might exist but you cannot see the code, ask one `question:`. A change that handles its input well gets `praise:` that names what it did, such as the parameterised query or the contained path, and you say it is clear.

## Your reply

List the findings, each starting with its label. End by saying whether any `blocker:` or `question:` needs a re-check.
