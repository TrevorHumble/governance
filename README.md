# governance

The parent governance repo. The constitution.

Global standards, agent definitions, pipeline rules, and hooks live here and sync out
to every child repo (wedding-scavenger-hunt, the Blender repos, and whatever comes next).

Rules of the road, settled 2026-08-16:

- **Global wins by default.** A child may override a global rule only by declaring it
  in its own local override file, naming the rule and the reason. The global file itself
  is never edited in a child.
- **Governance fixes are made here**, in this repo, even when discovered mid-build in a
  child. Full review runs here.
- **Children pull on build.** Every child checks this repo for updates at build start.
  A pull lands as a small PR in the child with one lightweight review asking only:
  does the new global rule contradict a local rule? No contradiction: merge. One clear
  fix: fix and merge. Multiple ways to fix: stop and ask the owner.

Seed content comes from wedding-scavenger-hunt, the current gold standard.
