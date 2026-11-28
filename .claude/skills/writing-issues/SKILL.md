---
name: writing-issues
description: Use when shaping a whole issue from the owner's vision, before the hand-off.
---

# Writing an issue

An issue is a vertical slice: the smallest feature a user can use end to end. Write the story with `writing-user-stories` and the Done-when list with `writing-acceptance-criteria`.

- **Slice.** If the vision holds several features, write the first feature and list the others in one line as later issues. In governance, a slice is a task an agent can finish end to end in one run. A refactor with no visible change may split by layer if the issue says so.
- **Found on the way.** A research find beside the goal goes in the issue as one criterion starting `Found:`, outside the count of six, when the find is an owner call or a fix over the limit in `standards/deciding.md`, "Stay in scope", and the issue still fits one run and the Length cap. The owner strikes the criterion at the hand-off or approves the criterion with the others. A fix under that limit needs no criterion. A bigger find is one line under later issues.
- **Title.** Everyday words the owner can read at a glance: the new user ability, or the change. No jargon, no layer names.
- **Length.** The story and Done-when list total under 300 words, so the owner reads little. Past 300 words, the slice is too big; cut the slice. The plan has no length cap.
- **Plan.** The bar: Haiku could build the change from the plan alone, without guessing. The plan has:
  1. Numbered steps, each naming the file, the function or section, and the change. "Update the handling" fails; "in `x.js`, in `filter()`, reject values not in `ALLOWED`" passes.
  2. For each step, the breakage risk and the proof of success.
  3. For each Done-when item, the delivering step.
  4. Every file the run will touch, and every unverified assumption.
- **Expected token change.** The change to governance's token count, as `npm run check:budget` measures the count (not design tokens). Write the number, such as "+120" or "none". Cap rules: `AGENTS.md`. Governance home only; a child repo's issue omits the number.
