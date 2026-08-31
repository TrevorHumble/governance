# Owner hand-off: written format

Moved from `standards/issue-standards.md` § "Owner hand-off". Named by
`standards/pipeline/steps/05-hand-off.md`.

The line breaks below are part of the format. The wording is a suggested shape, not a
character-exact template: "As a / I need / so that" is convenience, not doctrine (Ron Jeffries,
https://ronjeffries.com/xprog/blog/how-should-user-stories-be-written/, checked 2026-08-22).

- **Title:** one line, plain language, naming what is needed, not how it is built.
- **User story:** three lines, each on its own line:
  ```
  **As a** [persona],
  **I need** [thing],
  **so that** [outcome].
  ```
- **Acceptance criteria:** one fenced block holding one or more scenarios. Each scenario opens
  with `Scenario <n>: <short description>` on its own line, followed by `GIVEN`, `WHEN`, `THEN`
  each on its own line, with optional `AND` lines after any of them. Keywords in capitals, one
  keyword per line, a blank line between scenarios.

Filled example:

> **Title:** Every rider sees their own trip, not the whole schedule
>
> **As a** rider,
> **I need** my trip list to show only the trips I booked,
> **so that** I never wonder whose trip is whose.
>
> ```
> Scenario 1: I see my own trip
> GIVEN I have booked a trip
> WHEN I open my trip list
> THEN my trip is there
>
> Scenario 2: I do not see another rider's trip
> GIVEN another rider has booked a trip
> WHEN I open my trip list
> THEN their trip is not there
> ```
