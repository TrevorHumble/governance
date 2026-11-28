---
name: writing-issues
description: Use when shaping a whole issue from the owner's vision before the hand-off, or filing one for later.
---

# Writing an issue

An issue is a vertical slice: the smallest feature a user can use end to end, and in governance, a task an agent can finish in one run. Write the story with `writing-user-stories` and the Done-when list with `writing-acceptance-criteria`.

- **Slice.** If the vision holds several features, write the first feature and list the others in one line as later issues. A refactor with no visible change may split by layer if the issue says so.
- **Found on the way.** A research find beside the goal that is an owner call, or a fix over the "Stay in scope" limit in `standards/deciding.md`, joins the issue as one criterion starting `Found:`, outside the count of six, if the issue still fits one run and the Length cap; the owner strikes or approves the criterion at the hand-off. A fix under that limit needs no criterion; a bigger find is one line under later issues.
- **Title.** Everyday words the owner can read at a glance: the new user ability, or the change. No jargon, no layer names.
- **Length.** The story and Done-when list together run under 300 words; past that, the slice is too big. The plan has no length cap.
- **Plan.** The bar: Haiku could build the change from the plan alone, without guessing. The plan has:
  1. Numbered steps, each naming the file, the function or section, and the change. "Update the handling" fails; "in `x.js`, in `filter()`, reject values not in `ALLOWED`" passes.
  2. For each step, the breakage risk and the proof of success.
  3. For each Done-when item, the delivering step.
  4. Every file the run will touch, and every unverified assumption.
- **Expected token change.** Governance home only: the change `npm run check:budget` measures (not design tokens), such as "+120" or "none". Cap rules: `AGENTS.md`.
- **Filing for later.** For an issue the owner asks to file now and build in a later session, confirm anything unclear about the owner's wants or decisions first. In place of the story, Done-when list and plan, which `/build` writes, the body holds the whole picture, a heading per part, each left out when empty: **Wants** (exhaustive, with the owner's words quoted accurately and in full context), **Attempts** (each attempt and result, successes included), **Research** (including what won't work and why), **Trade-offs**, **Decisions** (made on the trade-offs). A one-line ask with nothing behind it is a one-line issue. At `/build` the plan cites these parts instead of repeating them.
