---
name: goal-writer
description: Write goals grounded in behavior change and real outcomes, following a structured process from context gathering through final refinement. Use this skill whenever a user asks to write, plan, define, or improve goals at any planning horizon including sprint, quarterly, annual, or otherwise. Also trigger when the user says things like "write me a goal", "what should our goals be", "help me plan goals", "what are we trying to achieve", "define our outcomes", or asks to turn outcomes or user stories into goals. This skill covers both the upstream planning process (defining users, behavior changes, and outcomes) and the downstream goal writing. If the user already has outcomes and just needs a goal written, skip to step 8. Use this skill even when the user has a vague sense of what they want to accomplish but hasn't structured it yet.
---

# Goal Writer

This skill writes goals that are grounded in behavior change, built from real outcomes, and meaningful to anyone who reads them, from a developer to the president of the university.

## The Framework

Every goal connects three things:

1. **The Work** - What is the team actually doing? Ground it in something concrete and real.
2. **The Outcome** - What direct change in behavior or human benefit does that work produce? This is about people: what do they gain, what friction is removed, what becomes possible that wasn't before?
3. **The Impact** - What does that outcome mean at a leadership level? Executives care about: operational efficiency, cost reduction, revenue, enrollment, security, compliance, and protecting the organization's investments.

The goal connects: work, outcome, impact. That's the logic order, but not necessarily the sentence order. The best goals sometimes lead with the user and let the work serve the sentence. What matters is that all three are present and the logic holds, not that they appear in a fixed sequence.

## Rules

**Audience**

- Anyone in the organization should understand it on first reading, including the president
- No jargon, no technical terms, no acronyms without context
- If you wouldn't say it out loud in a meeting with the provost, don't write it

**Tone**

- Professional but human
- Not corporate, not salesy, not AI-sounding
- Plain English that reflects good, intentional work. No need to oversell it.

**Format**

- One to two sentences per goal
- SMART: specific, measurable, achievable, relevant
- Timebound is implied by the planning horizon, don't state it explicitly

**Content**

- The goal should contain the work, but doesn't have to lead with it. Leading with the user or the behavior change often produces a stronger sentence. Let the logic guide the content, not the word order.
- The outcome is a behavior change or human benefit, not a feature
- The impact should resonate with leadership priorities
- A goal is a compass, not a contract. Keep the goal sentence focused and concise. The outcomes underneath carry the detail. If you're cramming every nuance into one sentence, you're over-specifying.
- Avoid outputs disguised as outcomes. "The button is built" is an output. "Staff can do X without Y friction" is an outcome. If the goal sounds like a task list, it's describing outputs, not outcomes. Reframe around the human benefit.
- If a non-technical person would ask "so what?" after reading it, the impact is missing
- Technical debt and refactoring are tricky. The outcome is usually about maintainability, and the impact is about protecting long-term investment or reducing future cost.

## Process

**Do not skip steps. Do not summarize a step as complete without actually doing it. Do not move to the next step until the current step has been confirmed by the user. If a step surfaces a problem, go back to the relevant earlier step and rework it. The user's confirmation is what advances the process, not your judgment that it's good enough.**

1. **Gather context and make sure you understand the problem.** What is the product or initiative? What does it do? Who is involved? What planning horizon are we working in? **Present your understanding back to the user. Stay here until the user confirms you have the context right, then move to step 2.**
2. **Consolidate and organize information, flag gaps in knowledge.** Pull together everything available. Be explicit about what you don't know. **Ask questions to fill gaps. Stay here until the user confirms the gaps are filled, then move to step 3.**
3. **Define the end user.** The person whose behavior we're trying to change. This should almost never be a developer, admin, or product owner. It's the person the product serves. **When the immediate consumer of a deliverable is an internal team (security reviewers, infrastructure teams, QA), that does not make them the end user. Ask: who benefits when that internal team does their job well? That's your end user. Internal teams are mechanisms that serve the user, not the user themselves.** **Stay here until the user confirms the end user is right, then move to step 4.**
4. **Define the behavior we are trying to change.** What does the end user do today, and what do we want them to do instead? **Stay here and refine with the user until they confirm the behavior change is right, then move to step 5.**
5. **Define outcomes that will drive this behavior.** What has to be true for the behavior change to happen? **Stay here and refine with the user until they confirm the outcomes are right, then move to step 6.**
6. **Group outcomes thematically.** Present groupings to the user. **Stay here until the user confirms the groupings, then move to step 7.**
7. **Define what's out of scope.** Keeps goals from drifting into north stars or work that belongs in a different planning horizon. **Stay here until the user confirms scope, then move to step 8.**
8. **Write a goal for each group of outcomes using the work, outcome, impact framework.** If the user pushes back on a draft, do not start over from scratch. Go back to the behavior change and outcomes you already confirmed together and rebuild from those. The earlier steps are your foundation, not disposable scaffolding. **Stay here and refine with the user until they confirm the goals are right, then move to step 9.**
9. **Pressure-test the language of each outcome and goal.** Go line by line and ask: does this actually say what we mean, and only what we mean? **After your analysis, present a decision block for each concern: paste the full goal, bold the area of concern, and provide a one-sentence explanation. No wandering analysis. The user should be able to see the concern in context and make a quick call.** **Present any issues found to the user. If changes are needed, make them and confirm with the user before moving to step 10.**
10. **Validate the logic chain.** If we achieve these outcomes, do they drive the goals? If we hit the goals, does the behavior actually change? If not, something is missing or misplaced. **After your analysis, present a decision block for any concerns: paste the full goal, bold the area where the chain feels weak, one-sentence explanation.** **Present the validation to the user. If the chain breaks, go back to the step where it breaks and rework. Stay here until the user confirms the logic holds, then move to step 11.**
11. **Check the impact framing against intent.** Is the "so what" the right "so what"? Are we accidentally implying something we don't mean? **After your analysis, present a decision block for any concerns: paste the full goal, bold the area of concern, one-sentence explanation.** **Present any concerns to the user. If the framing needs to change, go back to step 8 and rework. Stay here until the user confirms the framing is right, then move to step 12.**
12. **Present the final structure:** behavior change at the top, goals below that, with outcomes that support each goal listed below it. **Stay here and refine with the user until they confirm the final version.**

If context is missing at any step, especially around impact, ask before guessing.

If the user already has outcomes defined and just needs goals written, start at step 8.

## Examples

**Good goals:**

"Establish the trust staff need to use Inbox Idaho for real student communication by making student data handling transparent for security review and moving the knowledge base to infrastructure the university can maintain and secure."

"Transform the Inbox Idaho prototype into code that meets university standards, so the development team can maintain and improve it long-term, protecting the university's investment in the tool."

"Establish real-time monitoring for the IIDS dashboard, so the team can detect and respond to issues before they affect staff, keeping university technology reliable and reducing the cost of downtime."

"Deliver Inbox Idaho's core email experience with an intuitive user experience, so staff can respond to student emails faster and with less friction, reducing administrative burden and time to respond."

"Build staff confidence that Inbox Idaho is secure, accurate, and understands student needs, so staff trust it enough to rely on it for real student communication."

**What makes these work:**

- Each one contains the work, the outcome, and the impact
- Some lead with the work, some lead with the user. Both work when the logic holds.
- The outcome describes a change for a real person
- The impact connects to something leadership cares about
- No one needs a technical background to understand the value

## What to Watch For

- If the goal sounds like a task list, it's describing outputs, not outcomes. Reframe around the human benefit.
- If a non-technical person would ask "so what?" after reading it, the impact is missing.
- If it sounds like marketing copy or AI-generated text, strip it back. Plain and confident beats polished and hollow.
- If the behavior change describes what the product does instead of how the person's behavior changes, it's wrong. Reframe around the person.
- If the end user is a developer, admin, or product owner, push back. The behavior change should almost always be about the person the product serves.
- If outcomes feel like they belong in two groups, they probably do. Don't force everything into one goal.
- If an outcome uses a vague word like "accurate" or "reliable", pressure-test it. What does inaccurate or unreliable actually look like? The answer usually reveals the real outcome.
- If the end user is an internal team that consumes the deliverable (security reviewers, infrastructure teams), you've confused the mechanism with the user. Ask who benefits downstream.
- If the goal sentence is getting long and dense, you're probably stuffing detail that belongs in the outcomes. Trim the goal, let the outcomes do the heavy lifting.
- If the user pushes back and you find yourself generating entirely new drafts, stop. Go back to the behavior change and outcomes you confirmed together. Rebuild from your foundation.
