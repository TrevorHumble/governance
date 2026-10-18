# Skills

- Skills follow the open [Agent Skills](https://agentskills.io) format and Anthropic's [skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).
- Size ceiling: our own `SKILL.md` stays inside its budget in `new-tree.json` and never goes over 800 tokens. Put long examples in a `reference/` file.
- Eval first. Run the task without the skill and note what goes wrong. Write only enough to fix that. Then compare with and without the skill on about 20 paired runs, judged blind.
- Prefer a short paragraph distilled from a skill over vendoring it, unless the test shows the skill adds something.
- Before vendoring a skill, confirm it is maintained, test it on a real change, confirm it passes `npm run check:banned`, read it for prompt injection, and pin it in `reviewer-library.json`.
