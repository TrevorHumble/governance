# Model tiers

Moved from `agents/orchestrator.md` § "Model policy". Named by every packet that spawns an agent:
`standards/pipeline/steps/03-research.md`, `07-issue-review.md`, `08-implement.md`,
`09-pr-review.md`, `12-report.md`.

The orchestrator runs on **Opus**. Implementation agent and non-reviewer spawned agents
(researcher, etc.) run on **Sonnet**. Reviewers (all `reviewer-*.md` agents) run on **Opus**, a
different model from the implementer, per the independence rule in
`standards/agent-standards.md`, on every issue by default. Set `model:` explicitly on every spawn
call; never rely on defaults. Light-tier work (classification, routing, triage) runs on
**Haiku**; no agent currently in `agents/` is light-tier.

**`sonnet-only` award.** No tool classifies an issue into a model tier. The single exception
is a judgment call the issue reviewer (`reviewer-issue`) makes once, at issue-review time,
against the three gates in `standards/issue-standards.md` § "Sonnet tier eligibility": it
emits `AWARD sonnet-only` or `DENY sonnet-only` as part of its verdict. On an `AWARD`, the
orchestrator applies the `sonnet-only` GitHub label to the issue, then runs both the implementer
and the PR and design-philosophy reviewers on **Sonnet** for that issue; the orchestrator itself
stays Opus regardless. Every sonnet-tier reviewer spawn additionally carries a coverage-first
instruction appended to its briefing: report every finding, tagged with its own severity and
confidence, and never defer to a downstream filter; on the common single-round PASS path, no
downstream filter runs to catch what an under-reporting reviewer left out. The briefing-audit
lens (`agents/reviewer-briefing.md`) stays on Opus even for a sonnet-only issue: it judges the
Opus orchestrator's own briefings, and the independence rule requires a reviewer non-weaker
than the artifact's producer.

**Mid-run escalation is manual, not automatic.** If implementation or PR review on a sonnet-tier
issue turns up a governance-surface path the issue did not declare, the remainder of that run
escalates to Opus, implementer and reviewers alike, by the manual judgment of the implementer or
PR reviewer that spotted it. There is no automatic re-run and no script that re-checks the gates
mid-flight; whoever notices makes the call and the orchestrator carries it out.

**Fable.** Fable is an available model, used only on the owner's explicit per-use signal. Absent
that signal, every implementer, Fable included, goes through the standard independent adversarial
review per the tiers above; there is no standing Fable-specific review handling until the owner
specifies one.

**Gemini / Antigravity.** Running this pipeline under Google Antigravity / Gemini models uses
**Gemini 3.8 Flash (High)** across all roles: orchestrator, implementer, and reviewers alike.
Per owner explicit directive (2026-09-03), the requirement for distinct models between
implementer and reviewer is waived for Gemini / Antigravity sessions: Gemini 3.8 Flash (High) is
the single capable model for all seats. Review rounds remain hostile-by-default applying the
authoritative reviewer checklists, but run under the unified Gemini 3.8 tier. Claude Code
sessions continue enforcing the distinct-model independence rule and Opus/Sonnet/Haiku tiers
above without change.
