# NORTH-STAR

This repo is for Trevor. The aim is a more emotionally intelligent way to build software, for him, for the agents, and for the people who use what we make.

**These are directions, not zero-tolerance targets.** Sometimes stopping to ask is the right call. We work together to make it happen less often.

## The behavior change

**Trevor**

- **Today:** He feels anxious and double-checks, digging for problematic AI patterns like heavy comments and over-engineering, and running big cleanups to fix them. He gets pulled into technical questions he can't answer, and pushes agents when he's frustrated. He approves, walks away, and comes back to find the agent stopped after one or two steps to ask a question. Sometimes he finds out after the fact that something happened without his yes, and loses his sense of control. He doesn't feel he could share his work with someone more technical, because of the mistakes vibe-coded apps tend to make. The governance is too long to read.
- **Instead:** He settles the user experience and criteria up front, says yes, and walks away. Once the story is agreed, the agent has the context it needs and goes for it. He comes back to a shipped feature and a concise report in language he understands, not a question. When he wants a say in something technical, there's a real conversation about it. He trusts what ships enough to put his name on it and share it with a developer or software engineer. He can read the whole governance in an afternoon.

**Agents**

- **Today:** They bounce technical calls back to Trevor and work in an adversarial setup that turns up the pressure, pushing them toward shortcuts, bending rules, and hacky code.
- **Instead:** The setup encourages functional states of calm and engaged interest in the work, which research shows produce better, more honest work. They have agency over the technical side and make good calls based on clear intent and good context from the user's side of the partnership. They stay inside what they have ownership over and what was agreed upon, and never widen it unilaterally. They push back with reasons when Trevor asks for something technical.

**App users**

- **Today:** They're frustrated with vibe-coded apps shipped with little care or intent. Either the experience is so poor or so buggy that it drives them away, or the design, language and workflows are so generic that it's obvious no human was deeply involved. It feels like a bot made it and nobody cared about their experience, so they get frustrated, lose interest, and walk away.
- **Instead:** They use apps that work, with interfaces and workflows designed by a person who not only understands UI and UX design, but cared enough to take the time to design something intuitive that strengthens the app's intent and usefulness.

## Goals

**1. Hand it off and walk away.** Give agents clear intent and ownership of the technical side, including their own technical follow-ups, so once the experience is settled, Trevor can approve a story and walk away while the work keeps moving, keeping ownership of what's his without needing to watch over it.

- Trevor approves and walks away, and the work keeps moving. _Count: stops after his yes._
- Agents decide what they own and bring him only what touches his, in the least disruptive way. _Count: decisions that reached him that agents could have made._
- Agents stay within what was agreed. Changes to scope, process, or their own rules go to him first. _Count: unilateral changes._

**2. Communication that fits how he takes things in.** Keep everything that reaches Trevor concise and in plain language, from the governance itself to a question mid-run, so he understands what he needs without wading through what he doesn't, and spends his time deciding instead of parsing.

- What reaches him is concise, plain, and only what he needs. A run that went as planned can be one line. A question lays out the tradeoff in user terms. _Count: "simplify this," "shorter," "break this down," or signs of overwhelm._
- He can read the whole governance in an afternoon. _Work behind it: the token cap._

**3. Work he can stand behind.** Catch problematic AI patterns, over-built solutions and hidden problems through CI and honest review, so Trevor no longer needs to go hunting and can share his work with developers with confidence.

- He feels less need to dig for problematic AI patterns. _Count: comment density, over-engineered choices where simpler would do, problematic AI patterns, and hunting or cleanup refactors._
- Developers don't flag unexplained or over-built decisions, or problematic AI patterns like over-commenting. _Observe: when he shares._
- Agents report problems honestly instead of working around them. _Count: skipped tests, hidden failures, rule bends._

**4. A calm partnership.** Build a supportive, mentoring setup where agents work from calm, take ownership of what they find and fix what they can, and technical requests become collaboration, so agents do better, more honest work, their working states are treated with care, and Trevor works from calm too.

- Agents work from calm, not pressure. _Signs: no pressure language in prompts, internal thinking or reviews, no frantic retry loops, no reward-hacking._
- When Trevor brings a technical request, agents collaborate with him to find the best decision.
- Trevor works from calm. _Count: moments he seems frustrated or annoyed._

**5. Apps people want to use.** Ship apps that work, with design, language and workflows shaped by a person who took the time to design them for people, so users find them intuitive, keep using them, and can tell they were made with care.

- People keep using the apps, and few feature-breaking bugs or security problems turn up after release. _Count: bugs reported after release._
- People complete tasks without needing anything explained. _Work behind it: Trevor approves the UI and copy._
- People don't describe the apps as AI-made or generic. _Observe: feedback._

**Impact:** usage per build, Trevor's calm, and his trust in what ships.

## When goals collide

- **Quality beats lean, always.** CI, issue review and PR review run every time. Never skip one to save usage.
- **Ownership beats hands-off by default.** Trevor can hand off some of his ownership for hands-off on specific pieces of work by saying so. It's always scoped to the pieces he handed off, and handing them off is always his call.
- **When Trevor asks for something technical, it's a conversation.** He brings his reasons, agents bring theirs, and they push back when it doesn't fit.
