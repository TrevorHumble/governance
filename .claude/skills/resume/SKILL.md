---
name: resume
description: Use after a break or a compacted context, or on /resume, to say where this run stands and what comes next.
metadata:
  reads: 'pipeline/PIPELINE.md'
---

# Resume

Say where things stand, then carry on only with what is yours.

1. Read your run note, `.run_state/<N>.md` (named for the branch before the issue had a number). It holds the step and the owner's last answer. Without one, `git status` and the branch's log tell you.
2. Check it against GitHub (`github-write`): the issue's labels and state, and the PR if there is one. Where they differ, GitHub wins; say so.
3. Name the step in `pipeline/PIPELINE.md` and do the next one. If the note says you are waiting on the owner, quote what you sent and wait; file and start nothing meanwhile.
4. A branch or PR your note does not name belongs to another run. List it; do not review, fix or merge it.
5. With no run of your own, list open PRs and issues and count the pending `buildlog/` fragments.
