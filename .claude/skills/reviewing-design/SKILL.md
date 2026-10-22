---
name: reviewing-design
description: Use when a pull request adds or reshapes a module, interface, layer, guard, or comment, to judge the design by depth rather than by how much code there is.
metadata:
  reads: 'standards/reviewing.md'
---

# Reviewing design

Read `standards/reviewing.md` first. Use the five labels, say why each finding matters, and name what held up, as defined there. The worked pairs are in `reference/examples.md`; read them before you flag anything.

## The lens is depth

A good module has a small interface in front of a lot of hidden work. Judge each new module, function, or layer against that, not against line count. "More code than needed" is not a design finding.

- **Shallow.** The interface is nearly as big as the job: options, getters, and setters for one use. Say what the author could hide inside.
- **Pass-through.** It forwards each call with the same signature. Apply the deletion test: if you removed it and nothing is lost, it is a pass-through, and "fine for now" does not excuse it. It earns its place only when it changes the error contract, the shape, or the policy.
- **Information leakage.** Two places know a format or rule that one should own. Name both and say which should own it.
- **Ghost gate.** A guard whose result nothing acts on, or that protects against a failure nobody can point to. Check the caller uses the result.
- **Comments.** One that says what the next line plainly does is a `nitpick:`. A comment that gives a reason the code cannot show is `praise:`.

Count adapters behind a seam: one is a hypothetical seam, two make it real.

These design words come from Matt Pocock's codebase-design skill (MIT), https://github.com/mattpocock/skills.

## Hold back

A finding points to one of the shapes above in the code as written. Style, naming taste, edge cases, missing imports from an elided diff, and "what if it grows" are not findings; leave them out. If the change is deep and small, give `praise:` that names why, and stop.

## Your reply

List the findings, each starting with its label. End by saying whether any `blocker:` or `question:` needs a re-check.
