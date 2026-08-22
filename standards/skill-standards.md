# Skill Standards

**As a skill reviewer or author, I need a single checkable standard so I can determine whether a skill passes or fails without guessing.**

---

## anti-bloat is the headline rule

SKILL.md is always in context when the skill fires. Every line costs tokens on every invocation. Cut aggressively: no preamble, no restatement of the section header, no examples that duplicate prose already present. Bloat is a defect only when a reviewer can quote the specific sentence that is removable without loss of meaning.

---

## Description / trigger metadata

The `description` field in YAML frontmatter is the sole mechanism that determines whether the skill fires. It must state what the skill does AND the specific user phrases or contexts that should trigger it. Triggering guidance belongs entirely in the description, not in the body.

---

## Progressive disclosure

Keep SKILL.md short (a hard cap of 500 lines). Push detail to `references/`, scripts to `scripts/`, and templates to `assets/`. Reference those files from SKILL.md with a line that names the file and the condition under which to read it. If a reader cannot tell from SKILL.md where to find more, the disclosure has failed.

---

## Updating a skill

When a user asks to update a skill, apply the author's intent rather than transcribing the user's words. The user's words describe a symptom or a desired outcome; the skill change must fix the underlying behavior. Preserve the skill's name and directory unchanged.

**Example** (user request): "add a bullet to github-write saying to check `git status` before committing."

- Before (literal transcription): a new bullet `- Check git status before committing.` appended under Conventions, while the Committing section already tells the agent to run `git status` before staging. The skill now says it twice; the second copy drifts when the first is edited.
- After (intent applied): no new bullet. The request revealed the user missed the existing line, so the fix is placement: keep the `git status` sentence anchored in the Committing section, where a reader hits it right alongside the commit commands, not duplicated under Conventions.

A skill's home in this repo is `.claude/skills/<name>/SKILL.md`: that is the path the harness
discovers project skills at, so a skill file placed anywhere else does not fire.

---

## Reviewer checklist

- [ ] PASS/FAIL: `description` field contains at least two strings enclosed in double-quotes or backticks.
- [ ] PASS/FAIL: SKILL.md body is under 500 lines; any section over 100 lines has a corresponding `references/` file.
- [ ] PASS/FAIL: Every file referenced in SKILL.md (scripts, references, assets) exists on disk.
- [ ] PASS/FAIL: No banned slop words appear in the file, per the sole list owned by `standards/documentation-standards.md` § "Anti-AI-slop".
- [ ] PASS/FAIL: No FINAL, LAST, or TRULY_FINAL in filenames or section headers referenced by this skill.
