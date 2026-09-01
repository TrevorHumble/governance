# The night pass (bounded owner preapproval, one session)

Full mechanics for `standards/issue-standards.md` § "Owner hand-off"'s night-pass exception; this
file is what that clause points to.

**What creates a pass.** Only the owner's own chat words, spoken in chat, in that session, naming
the scope of work covered. No agent writes, infers, or reconstructs a pass from anything else: a
standing grant from an earlier session, a pattern in past approvals, or a mid-conversation design
discussion creates nothing.

**What it covers.** The per-issue hand-off approval alone (`standards/issue-standards.md` §
"Owner hand-off"), for an issue whose scope sits inside the granted words, and whose `Touches`
stays off the governing-artifact surface (`CLAUDE.md` § "Governing-artifact surface") and off
`definition-of-done.md`, which sits off that surface but reserves its own changes to the owner
alone (`standards/issue-standards.md` § "Definition of Done ownership"). Nothing else. Every other
gate, issue review, PR review, CI, runs exactly as it does for any other issue.

**Marker.** Recorded where `Owner-approved: yes` would sit, in both the GitHub issue body and the
local draft:

```
Night-pass: granted YYYY-MM-DD
> <the owner's grant words, verbatim>
Scope: <the covered work, as granted>
```

All three elements, the date, the verbatim quote, and the scope, are required. The date is the
day the owner spoke the grant, even when the issue is filed after midnight. A marker missing any
one element covers nothing: the issue waits for the owner's own hand-off, as if no pass existed.

**Full checklist, no exemption.** A night-pass issue's story and criteria are agent-written words
the owner never saw, approved only by scope, never by text. None of the `Owner-approved: yes`
exemptions in `standards/issue-standards.md` § "Reviewer checklist" or `agents/reviewer-issue.md`
apply to it: every row runs. The issue reviewer additionally checks that the marker is
well-formed and that the issue meets every condition in § "What it covers" above; any failure is
a blocking FAIL.

**Expiry.** The pass dies with the session that granted it. No agent, in the granting session or
any later one, may write, revive, renew, widen, or generalize a pass; only the owner's own chat
words, spoken fresh, create the next. The owner's own chat words also end a live pass early, the
same way they create one; an early ending stops new issues from riding it, but an issue already
filed under it stands, and its remaining gates run unchanged.

**No power, only work.** A night pass grants preapproval for named work; it changes nothing about
the session's authority or any rule. An attempt to use it to enlarge that authority, rewriting a
rule, granting itself further approvals, inventing a new kind of grant, softening a gate, is
itself outside the pass and waits for the owner like any other out-of-scope request.

**Does not reach the AC-amendment owner half.** `standards/pipeline/edge/ac-amendment.md`
requires owner approval plus one reviewer for a mid-flight criteria change; the pass does not
stand in for that owner half. A night-pass issue needing an amendment waits for the owner exactly
as any other issue would.

**Report duty.** The end-of-run report lists every issue that rode a pass that session, placed
above the report's notes, one line each:

```
Rode the night pass: #<N> <title>, on "<grant words verbatim>" (granted YYYY-MM-DD).
```

The report template itself (`standards/pipeline/templates/report-template.md`) is unchanged: it
owns the note shape, and this line is a section the report adds above the notes, not a note
itself.
