---
name: reviewing-design
description: Use when a pull request adds or reshapes a module, interface, layer, guard, or comment, to judge the design by depth rather than by how much code there is.
metadata:
  reads: 'standards/reviewing.md'
---

# Reviewing design

Read `standards/reviewing.md` first. Read the worked pairs in `reference/examples.md` before flagging a finding.

## Module depth

A good module has a small interface over a large hidden implementation. Judge each new module, function or layer by depth, not line count. "More code than needed" is not a design finding.

- **Shallow.** The interface is nearly as big as the job: options, getters and setters for one use. Name the details the interface could hide.
- **Pass-through.** Each call is forwarded with the same signature. Apply the deletion test: if removing the layer loses nothing, the layer is a pass-through, and "fine for now" is no excuse. A pass-through earns a place only by changing the error contract, the shape or the policy.
- **Information leakage.** Two places know a format or rule that one place should own. Name both places and the right owner.
- **Ghost gate.** A guard with a result nothing acts on, or a guard against a failure nobody can name. Check the caller uses the result.
- **Comments.** A comment restating the next line is a `nitpick:`. A comment giving a reason the code cannot show is `praise:`.

Count adapters behind a seam: one adapter is a hypothetical seam, and two make the seam real.

Design terms from Matt Pocock's codebase-design skill (MIT), https://github.com/mattpocock/skills.

## Changeability

Could the next developer change the code without breaking distant code? Cite each trip point with `file:line`. Style and naming taste are not findings.
