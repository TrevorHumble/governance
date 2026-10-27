---
name: writing-issues
description: Use when shaping a whole issue from the owner's vision, before the hand-off.
---

# Writing an issue

An issue is a vertical slice: the smallest feature someone can use end to end. Write the story with `writing-user-stories` and the Done-when list with `writing-acceptance-criteria`.

- **Slice.** If the vision holds several features, write the first and list the rest in one line as later issues. In governance, a slice is something an agent can do end to end in one run. A refactor with no visible change may split by layer if the issue says so.
- **Title.** Plain words the owner can read at a glance: what someone can do, or what changes. No jargon, no layer names.
- **Length.** The body before the dependency map stays under 1,000 words. Past that, the slice is too big; cut it.
- **Plan.** Could a less capable model follow each step without going off the rails? Each step names what to create, read, or write, and where. "Update the handling" fails; "in `x.js`, reject values not in `ALLOWED`" passes.
- **Expected token change.** The change to governance's token count, as `npm run check:budget` measures it (not design tokens). Write the number, such as "+120" or "none". Cap rules: `AGENTS.md`.
