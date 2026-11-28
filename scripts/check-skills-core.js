// scripts/check-skills-core.js
// Pure rules for the skill-limits gate: a skill's name and description must load, its body stays
// under 500 lines, and a counted skill stays under the 800-token ceiling in standards/skills.md.
// No filesystem calls; check-skills.js supplies the files.
'use strict';

const {
  countWords,
  toTokens,
  isNotCounted,
  UPSTREAM_COPY_PATHS,
} = require('./check-token-budget-core');
const { countLines } = require('./check-file-size-core');

const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
const BODY_LINES_MAX = 500;
const TOKEN_CEILING = 800;

const failLine = (text) => `check-skills: FAIL, ${text}`;

/**
 * Reads `name` and `description` from a SKILL.md's frontmatter. Not a YAML parser: one line each,
 * optionally quoted, which is the shape every skill here uses.
 * @param {string} raw
 * @returns {{name?: string, description?: string, body: string}}
 */
function parseFrontmatter(raw) {
  const text = raw.replace(/^\uFEFF/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { body: text };
  const field = (key) => {
    const line = m[1].split(/\r?\n/).find((l) => l.startsWith(`${key}:`));
    if (line === undefined) return undefined;
    const value = line.slice(key.length + 1).trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    return quoted ? quoted[2] : value;
  };
  return { name: field('name'), description: field('description'), body: text.slice(m[0].length) };
}

/**
 * @param {{path: string, text: string}[]} skills every .claude/skills/<name>/SKILL.md
 * @param {string[]} notCounted notCounted entries from repo-profile.json and the manifest
 * @returns {{lines: string[], exitCode: number}}
 */
function run(skills, notCounted) {
  const failures = [];
  for (const { path, text } of skills) {
    if (isNotCounted(path, UPSTREAM_COPY_PATHS)) continue;
    const { name, description, body } = parseFrontmatter(text);
    if (!name || name.length > NAME_MAX || !/^[a-z0-9-]+$/.test(name)) {
      failures.push(
        failLine(
          `${path}: name "${name ?? ''}" must be 1 to ${NAME_MAX} lowercase letters, digits and hyphens, or the skill does not load.`
        )
      );
    }
    if (description && /^[>|]/.test(description)) {
      failures.push(
        failLine(
          `${path}: write the description on the description: line itself, not as a > or | block.`
        )
      );
    } else if (!description || description.length > DESCRIPTION_MAX) {
      failures.push(
        failLine(
          `${path}: the description is ${description ? description.length : 0} characters; it must be 1 to ${DESCRIPTION_MAX}, or the skill does not load.`
        )
      );
    }
    const bodyLines = countLines(body);
    if (bodyLines >= BODY_LINES_MAX) {
      failures.push(
        failLine(
          `${path}: the body is ${bodyLines} lines; keep it under ${BODY_LINES_MAX} and move detail to linked files.`
        )
      );
    }
    if (!isNotCounted(path, notCounted)) {
      const tokens = toTokens(countWords(text));
      if (tokens > TOKEN_CEILING) {
        failures.push(
          failLine(
            `${path}: about ${tokens} tokens, over the ${TOKEN_CEILING}-token ceiling in standards/skills.md.`
          )
        );
      }
    }
  }
  if (failures.length > 0) return { lines: failures, exitCode: 1 };
  return { lines: [`check-skills: OK, ${skills.length} skill(s) checked.`], exitCode: 0 };
}

module.exports = { run, parseFrontmatter, failLine };
