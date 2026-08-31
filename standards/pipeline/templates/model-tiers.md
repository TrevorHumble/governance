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

**Gemini / Antigravity.** Running this pipeline under Google Antigravity / Gemini models maps
tiers to these ecosystem defaults: the **Opus tier** (orchestrator plus reviewers) maps to
**Gemini 3.6 Flash (High)**; the **Implementer (Sonnet) tier** maps to **Gemini 3.5 (High) or
Sonnet 4.6** (Antigravity exposes Sonnet 4.6). These are defaults, not an override of the tiers
above: the reviewer must always run on a model that is different from, and non-weaker than, the
implementer's. Where a Gemini pairing would violate that, for example an implementer on Sonnet
4.6 paired with a reviewer left on a lighter default, the reviewer is bumped to a non-weaker model
rather than run under the default; the invariant governs, the mapping is illustrative.
