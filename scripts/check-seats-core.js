// scripts/check-seats-core.js
// Pure rules for the seats gate: whether seats.json is well-formed and its independence rules hold,
// and whether a PR changes only seat values. No process, filesystem, or git access here.
'use strict';

const { isDeepStrictEqual } = require('util');
const { ridesAlong } = require('./check-token-budget-core');

const REQUIRED_ROLES = [
  'orchestrator',
  'issue-writer',
  'issue-reviewer',
  'implementer',
  'code-reviewer',
  'referee',
  'researcher',
];
const SEAT_FIELDS = ['provider', 'model', 'effort'];
// The one award: it moves the seats up for hard work. No award lets a guarded pair share a model.
const KNOWN_AWARDS = ['hard'];

// Family words Claude Code's spawn call accepts as aliases. A fifth family needs a new alias from
// Claude Code first, then a new word here.
const CLAUDE_FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'];

// The model-ID pattern checks shape, not that a model exists: a well-formed ID for a model that
// was never released passes. Aliases ("opus", "inherit") fail, because an alias moves to a newer
// model on its own; a dated snapshot ID passes.
const PROVIDERS = {
  anthropic: {
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    modelPattern: new RegExp(`^claude-(${CLAUDE_FAMILIES.join('|')})-\\d+(-\\d+)?(-\\d{8})?$`),
  },
};

// Pairs of roles that must run on different models, on the base seats and under every award.
const INDEPENDENT_PAIRS = [
  { a: 'implementer', b: 'code-reviewer' },
  { a: 'issue-writer', b: 'issue-reviewer' },
  { a: 'referee', b: 'implementer' },
  { a: 'referee', b: 'code-reviewer' },
];

const failLine = (text) => `check-seats: FAIL, ${text}`;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const show = (v) => JSON.stringify(v) ?? String(v);

function seatProblems(seat, label) {
  const provider = isObject(seat) ? seat.provider : undefined;
  if (typeof provider !== 'string' || !Object.hasOwn(PROVIDERS, provider)) {
    return [`${label} names an unknown provider ${show(provider)}`];
  }
  const rules = PROVIDERS[provider];
  const problems = [];
  if (typeof seat.model !== 'string' || !rules.modelPattern.test(seat.model)) {
    problems.push(
      `${label} model ${show(seat.model)} is not a well-formed ${provider} model ID (an exact ID such as claude-<family>-<version>; aliases fail)`
    );
  }
  if (!rules.efforts.includes(seat.effort)) {
    problems.push(
      `${label} effort ${show(seat.effort)} is not a known ${provider} effort (${rules.efforts.join(', ')})`
    );
  }
  return problems;
}

function roleProblems(roles) {
  const problems = [];
  for (const role of REQUIRED_ROLES) {
    if (!Object.hasOwn(roles, role)) problems.push(`required role "${role}" has no seat`);
  }
  const skillOwner = new Map();
  for (const [role, seat] of Object.entries(roles)) {
    const label = `role "${role}"`;
    if (!REQUIRED_ROLES.includes(role)) {
      problems.push(`${label} is not one of the required roles (a typo?)`);
      continue;
    }
    if (!isObject(seat)) {
      problems.push(`${label} must be an object`);
      continue;
    }
    problems.push(...seatProblems(seat, label));
    if (typeof seat.agent !== 'string' || seat.agent === '') {
      problems.push(`${label} has no agent`);
    }
    if (!Array.isArray(seat.skills) || !seat.skills.every((s) => typeof s === 'string' && s)) {
      problems.push(`${label} skills must be an array of skill names`);
      continue;
    }
    const repeated = seat.skills.filter((skill, i) => seat.skills.indexOf(skill) !== i);
    for (const skill of new Set(repeated)) {
      problems.push(`skill "${skill}" is listed twice under role "${role}"`);
    }
    for (const skill of new Set(seat.skills)) {
      const owner = skillOwner.get(skill);
      if (owner !== undefined) {
        problems.push(`skill "${skill}" is listed under two roles ("${owner}" and "${role}")`);
      } else {
        skillOwner.set(skill, role);
      }
    }
  }
  return problems;
}

function awardProblems(awards) {
  const problems = [];
  for (const [name, entries] of Object.entries(awards)) {
    if (!KNOWN_AWARDS.includes(name)) {
      problems.push(`award "${name}" is not a known award (${KNOWN_AWARDS.join(', ')})`);
      continue;
    }
    if (!isObject(entries)) {
      problems.push(`award "${name}" must be an object`);
      continue;
    }
    for (const [role, seat] of Object.entries(entries)) {
      const label = `award "${name}" role "${role}"`;
      if (!REQUIRED_ROLES.includes(role)) {
        problems.push(`award "${name}" names unknown role "${role}"`);
        continue;
      }
      if (!isObject(seat)) {
        problems.push(`${label} must be an object`);
        continue;
      }
      for (const key of Object.keys(seat).filter((k) => !SEAT_FIELDS.includes(k))) {
        problems.push(
          key === 'agent' || key === 'skills'
            ? `${label} carries "${key}"; an award inherits agent and skills from the role it names`
            : `${label} carries "${key}"; an award entry holds only ${SEAT_FIELDS.join(', ')}`
        );
      }
      problems.push(...seatProblems(seat, label));
    }
  }
  return problems;
}

// The seats in force for a run: the roles, with an award's entries laid over them.
function effectiveSeats(roles, entries = {}) {
  return Object.fromEntries(
    Object.entries(roles).map(([role, seat]) => [role, { ...seat, ...entries[role] }])
  );
}

function independenceProblems(roles, awards) {
  const problems = [];
  const sameModel = (seats, a, b) =>
    typeof seats[a]?.model === 'string' && seats[a].model === seats[b]?.model;
  for (const { a, b } of INDEPENDENT_PAIRS) {
    if (sameModel(roles, a, b)) {
      problems.push(`"${a}" and "${b}" share the model ${roles[a].model}; they must differ`);
    }
  }
  for (const [name, entries] of Object.entries(awards)) {
    if (!KNOWN_AWARDS.includes(name) || !isObject(entries)) continue;
    const seats = effectiveSeats(roles, entries);
    for (const { a, b } of INDEPENDENT_PAIRS) {
      const touched = Object.hasOwn(entries, a) || Object.hasOwn(entries, b);
      if (!touched) continue;
      if (sameModel(seats, a, b)) {
        problems.push(
          `under award "${name}", "${a}" and "${b}" share the model ${seats[a].model}; they must differ`
        );
      }
    }
  }
  return problems;
}

// The seats pattern's prefix (the model pattern above), unanchored, so a dated or suffixed ID
// matches too. Shared markdown must not name a model; seats.json is the one home.
const MODEL_ID_IN_TEXT = new RegExp(`claude-(${CLAUDE_FAMILIES.join('|')})-\\d`);

/**
 * The names seats.json and the profile point at must be real files: each role's agent a file in
 * .claude/agents/, each skill and each lens a folder in .claude/skills/.
 * @param {unknown} seats the parsed seats.json
 * @param {string[]} tracked repo-relative paths of the tracked files
 * @param {string[]} lenses the `lenses` list from repo-profile.json
 * @returns {string[]} one problem per name that matches no file
 */
function referenceProblems(seats, tracked, lenses = []) {
  if (!isObject(seats) || !isObject(seats.roles)) return [];
  const agents = new Set();
  const skillFolders = new Set();
  for (const file of tracked) {
    const agent = /^\.claude\/agents\/([^/]+)\.md$/.exec(file);
    if (agent) agents.add(agent[1]);
    const skill = /^\.claude\/skills\/([^/]+)\//.exec(file);
    if (skill) skillFolders.add(skill[1]);
  }
  const problems = [];
  for (const [role, seat] of Object.entries(seats.roles)) {
    if (!isObject(seat)) continue;
    if (typeof seat.agent === 'string' && seat.agent !== '' && !agents.has(seat.agent)) {
      problems.push(`role "${role}" agent "${seat.agent}" is not a file in .claude/agents/`);
    }
    for (const skill of Array.isArray(seat.skills) ? seat.skills : []) {
      if (typeof skill === 'string' && skill && !skillFolders.has(skill)) {
        problems.push(`role "${role}" skill "${skill}" is not a folder in .claude/skills/`);
      }
    }
  }
  if (!Array.isArray(lenses) || !lenses.every((l) => typeof l === 'string')) {
    problems.push('repo-profile.json lenses must be an array of strings');
    return problems;
  }
  for (const lens of lenses) {
    if (!skillFolders.has(lens)) {
      problems.push(`repo-profile.json lens "${lens}" is not a folder in .claude/skills/`);
    }
  }
  return problems;
}

/**
 * Shared markdown never names a model; seats.json is the only home for model IDs.
 * @param {{path: string, text: string}[]} files the shared .md files and their text
 * @returns {string[]} one problem per file that carries a model ID
 */
function modelIdProblems(files) {
  return files
    .filter((f) => MODEL_ID_IN_TEXT.test(f.text))
    .map((f) => `${f.path} names a model ID; model IDs live in seats.json only`);
}

/**
 * Every rule seats.json must hold. Never throws; a malformed value is a returned problem.
 * @param {unknown} seats the parsed seats.json
 * @returns {string[]} one plain-language problem per broken rule, empty when the file is valid
 */
function validateSeats(seats) {
  if (!isObject(seats)) return ['seats.json must be an object with "roles" and "awards"'];
  const problems = [];
  const roles = seats.roles;
  const awards = seats.awards === undefined ? {} : seats.awards;
  if (!isObject(roles)) problems.push('"roles" must be an object');
  if (!isObject(awards)) problems.push('"awards" must be an object');
  if (problems.length > 0) return problems;
  problems.push(...roleProblems(roles), ...awardProblems(awards));
  problems.push(...independenceProblems(roles, awards));
  return problems;
}

// Leaf-by-leaf comparison of two JSON values. A leaf is a scalar, an array, or a key present on
// one side only; arrays compare whole, so any skills edit is one change.
function diffLeaves(before, after, path = []) {
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((k) => diffLeaves(before[k], after[k], [...path, k]));
  }
  return isDeepStrictEqual(before, after) ? [] : [{ path, before, after }];
}

// Seat values sit at roles.<role>.<field> and awards.<award>.<role>.<field>.
const SEAT_DEPTH = { roles: 3, awards: 4 };

function isSeatValueChange({ path, before, after }) {
  return (
    path.length === SEAT_DEPTH[path[0]] &&
    SEAT_FIELDS.includes(path[path.length - 1]) &&
    typeof before === 'string' &&
    typeof after === 'string'
  );
}

const describeSeat = (path) => (path[0] === 'roles' ? path[1] : `${path[1]} / ${path[2]}`);

/**
 * Whether a PR changes only seat values, and the changed seats for the owner.
 * @param {object} args
 * @param {string[]} args.changed repo-relative paths the PR changes
 * @param {unknown} args.baseSeats parsed seats.json at the base, or undefined when absent there
 * @param {unknown} args.headSeats parsed seats.json at the head
 * @returns {{seatsOnly: boolean, reasons: string[], changes: {seat: string, field: string, before: string, after: string}[]}}
 *   `reasons` says why the PR is not seats-only; `changes` lists the provider, model, and effort
 *   values that differ
 */
function classifyPr({ changed, baseSeats, headSeats }) {
  const reasons = [];
  const others = changed.filter((f) => f !== 'seats.json' && !ridesAlong(f));
  if (!changed.includes('seats.json')) reasons.push('the PR does not change seats.json');
  if (others.length > 0) reasons.push(`it also changes ${others.join(', ')}`);
  if (baseSeats === undefined) reasons.push('seats.json is not readable at the base');

  const leaves = baseSeats === undefined ? [] : diffLeaves(baseSeats, headSeats);
  const other = leaves.filter((l) => !isSeatValueChange(l));
  if (other.length > 0) {
    reasons.push(
      `it changes more than seat values (${other.map((l) => l.path.join('.')).join(', ')})`
    );
  }
  const changes = leaves.filter(isSeatValueChange).map(({ path, before, after }) => ({
    seat: describeSeat(path),
    field: path[path.length - 1],
    before,
    after,
  }));
  if (reasons.length === 0 && changes.length === 0) reasons.push('no seat value changes');
  return { seatsOnly: reasons.length === 0, reasons, changes };
}

function changeTable(changes) {
  const rows = [
    ['Seat', 'Field', 'Before', 'After'],
    ...changes.map((c) => [c.seat, c.field, c.before, c.after]),
  ];
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  return rows.map((r) => `  ${r.map((cell, i) => cell.padEnd(widths[i])).join('  ')}`.trimEnd());
}

/**
 * The gate's verdict. Rule failures exit 1; a PR that is not seats-only is reported, not failed.
 * @param {unknown} headSeats the parsed seats.json at the head
 * @param {{ref: string, baseSeats: unknown, changed: string[]}} [base] set when a base was given
 * @param {{tracked: string[], lenses: string[], sharedMarkdown: {path: string, text: string}[]}} [refs]
 *   what the file-name and model-ID rules read; omitted, those rules are off
 * @returns {{lines: string[], exitCode: number}}
 */
function run(headSeats, base, refs) {
  const problems = validateSeats(headSeats);
  if (refs) {
    problems.push(
      ...referenceProblems(headSeats, refs.tracked, refs.lenses),
      ...modelIdProblems(refs.sharedMarkdown)
    );
  }
  const lines = problems.map((p) => failLine(p));
  if (problems.length === 0) {
    const roles = Object.keys(headSeats.roles).length;
    const awards = Object.keys(headSeats.awards ?? {}).length;
    lines.push(`check-seats: ok, ${roles} roles and ${awards} award(s) hold every rule`);
  }
  if (base) {
    const verdict = classifyPr({ ...base, headSeats });
    if (verdict.seatsOnly) {
      lines.push(
        `check-seats: seats-only PR against ${base.ref}: only provider, model, and effort values change`,
        ...changeTable(verdict.changes)
      );
    } else {
      lines.push(
        `check-seats: not a seats-only PR against ${base.ref}: ${verdict.reasons.join('; ')}`
      );
    }
  }
  return { lines, exitCode: problems.length > 0 ? 1 : 0 };
}

module.exports = {
  REQUIRED_ROLES,
  validateSeats,
  referenceProblems,
  modelIdProblems,
  effectiveSeats,
  classifyPr,
  run,
  failLine,
};
