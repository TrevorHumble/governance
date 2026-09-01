---
name: capture-system-defect
description: >
  Turn a noticed system defect into a report note without derailing the current task or filing an
  issue on the agent's own initiative. Use when "a skill misbehaves", "a standard is ambiguous",
  "a reviewer rubber-stamps", "a reviewer false-flags", or any other machinery defect surfaces
  during a run.
---

# Capturing a system defect

When you notice a defect in the repo's own machinery during a run, do not silently work around it,
and do not file an issue for it: `agents/orchestrator.md` § "No agent files its own issue" governs.
This skill writes the note and returns you to the current task.

**Caused by your own diff? Wrong door.** If the defect is a direct consequence of the change you
are making right now, a comment or cross-reference your own edits just made false, this skill is
not where it goes: it is fixed in place under `standards/adversarial-review-protocol.md` §
"Finding disposition", "Recording a widening" paragraph (the single owner of the record's shape
and where it lands), rather than captured as a note. Use this skill only for a defect your current
diff did not cause.

**Small, or in a file nobody holds? Also the wrong door.** Before writing any note, run the fix
through the size rule (`standards/issue-standards.md` § "The file claim and the size rule", the
single owner of its branches and threshold): a fix any of its permitting branches covers is made
under that rule, in this run, and never becomes a note. This skill captures only what its branch
4 forbids fixing now (a large change to a file another run holds), plus defects that are not file
edits at all (a process step, an external behavior).

## Step 1: identify and describe the defect

Write a one-paragraph description covering:

- what the defect is (observable behavior, not a guess about root cause)
- which artifact is affected (`agents/`, `standards/`, `.claude/skills/`, or a process step)
- what triggered the observation
- whether it has ever done real damage, stated plainly when the answer is no (per
  `standards/pipeline/templates/report-template.md`)

## Step 2: determine whether it blocks the run

**Blocks:** the bar is `agents/orchestrator.md` § "No agent files its own issue" rule 3 (the old
`fix-now` case). Halt and report to the owner right then; the halt is logged per that file's §
"Stop condition". The owner decides; this agent never files an issue for it.

**Does not block:** everything else. Carry it as a note and keep working; the current task does
not pause.

**Scenario (blocks):** while implementing an issue, `tools/issue-core.ps1`'s `Resolve-IssueNumber`
stops matching a valid `Closes #N` commit message, so the commit-msg hook blocks every commit on
the branch. Basis: the current task cannot complete correctly (no commit can land) and there is no
workaround that does not involve bypassing the gate, so halt and report right then.

**Scenario (does not block):** during the same run you notice `agents/researcher.md` cites a
section header that was renamed two merges ago; the stale name threads through a dozen lines of
that file, and another run's live claim holds it with a rewrite in flight (the size rule's
branch 4). Basis: the stale pointer does not block the
current task, you found the right section anyway, and the size rule forbids the fix right now, so
carry it as a note and keep going. Were the file free, or the fix small, the size rule would make
this a fix, not a note.

## Step 3: write the note

Hand the note upward through the route this agent's own spec defines, per
`standards/agent-standards.md` § "Input / output contract". Do not draft a GitHub issue or call
`gh issue create` for it.

## Step 4: return to the current task

After writing the note, resume the interrupted task. The note reaches the owner in the end-of-run
report; the owner decides from its four priced options whether it graduates onto the board. No
separate escalation step is needed unless the defect blocked the run (step 2).
