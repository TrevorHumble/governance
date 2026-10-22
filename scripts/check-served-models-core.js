// scripts/check-served-models-core.js
// Pure rules for the served-model check: which seat a spawned subagent was meant to fill, and
// whether the model that served it and the effort it was asked for match that seat. No process,
// filesystem, or git access here.
'use strict';

// The same tag rule as _claude/hooks/hook-core.ps1 ($ROLE_TAG): `[<role>]` or `[<role> hard]` at
// the start of a spawn description. A different language means a second copy, kept in step by hand.
const ROLE_TAG = /^\s*\[([a-z][a-z0-9-]*)(?:\s+(hard))?\]/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The role and award a spawn description starts with.
 * @param {unknown} description the spawn's description
 * @returns {{role: string, hard: boolean} | null} null when there is no tag
 */
function roleTag(description) {
  if (typeof description !== 'string') return null;
  const m = ROLE_TAG.exec(description);
  return m ? { role: m[1], hard: m[2] !== undefined } : null;
}

/**
 * The seat a tag names: the role's seat, with the hard award laid over it when the tag says hard
 * and the award has an entry for that role. Mirrors how the orchestrator picks the seat to spawn.
 * @param {unknown} seats the parsed seats.json
 * @param {{role: string, hard: boolean}} tag
 * @returns {{model: string, effort: string} | null} null when seats.json has no such role
 */
function seatFor(seats, tag) {
  const base = isObject(seats) && isObject(seats.roles) ? seats.roles[tag.role] : undefined;
  if (!isObject(base)) return null;
  const award = tag.hard ? seats.awards?.hard?.[tag.role] : undefined;
  return { ...base, ...(isObject(award) ? award : {}) };
}

/**
 * The distinct models that served a subagent's turns, in order of first appearance. A line that is
 * not JSON, or has no model, is skipped; so is "<synthetic>", which Claude Code writes for turns
 * it made up without calling a model.
 * @param {string} transcript the text of an agent-*.jsonl file
 * @returns {string[]}
 */
function servedModels(transcript) {
  const models = [];
  for (const line of transcript.split('\n')) {
    if (line.trim() === '') continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const model = isObject(entry) && isObject(entry.message) ? entry.message.model : undefined;
    if (typeof model === 'string' && model !== '<synthetic>' && !models.includes(model)) {
      models.push(model);
    }
  }
  return models;
}

/**
 * Compare one subagent with its seat.
 * @param {object} args
 * @param {string} args.name the agent's id, for the report
 * @param {unknown} args.meta the parsed agent-*.meta.json (what was asked)
 * @param {string | undefined} args.transcript the text of agent-*.jsonl, or undefined when absent
 * @param {unknown} args.seats the parsed seats.json
 * @returns {{name: string, status: 'ok' | 'untagged' | 'mismatch', lines: string[]}}
 */
function checkSpawn({ name, meta, transcript, seats }) {
  const description = isObject(meta) ? meta.description : undefined;
  const label = `${name} (${JSON.stringify(description ?? null)})`;
  const tag = roleTag(description);
  if (!tag) {
    return {
      name,
      status: 'untagged',
      lines: [`${label}: the description starts with no [<role>] tag, so no seat to check`],
    };
  }
  const seat = seatFor(seats, tag);
  if (!seat) {
    return {
      name,
      status: 'mismatch',
      lines: [`${label}: the tag names role "${tag.role}", which seats.json has no seat for`],
    };
  }
  const where = `${tag.role}${tag.hard ? ' (hard)' : ''}`;
  const lines = [];
  if (transcript === undefined) {
    lines.push(
      `${label}: ${where}: no transcript (agent-${name}.jsonl), so the served model is unknown`
    );
  } else {
    const served = servedModels(transcript);
    if (served.length === 0) {
      lines.push(`${label}: ${where}: the transcript records no served model`);
    } else if (served.length > 1 || served[0] !== seat.model) {
      lines.push(`${label}: ${where}: seat model ${seat.model}, served ${served.join(', ')}`);
    }
  }
  const asked = isObject(meta) ? meta.effort : undefined;
  if (asked !== seat.effort) {
    lines.push(
      `${label}: ${where}: seat effort ${seat.effort}, asked ${asked === undefined ? 'nothing recorded' : asked}`
    );
  }
  return { name, status: lines.length > 0 ? 'mismatch' : 'ok', lines };
}

/**
 * The check's report over every subagent of a session.
 * @param {{name: string, meta: unknown, transcript: string | undefined}[]} spawns
 * @param {unknown} seats the parsed seats.json
 * @returns {{lines: string[], exitCode: number}} exit 1 when any spawn is a mismatch or untagged
 */
function run(spawns, seats) {
  const results = spawns.map((s) => checkSpawn({ ...s, seats }));
  const bad = results.filter((r) => r.status !== 'ok');
  const lines = bad.flatMap((r) => r.lines.map((l) => `check-served-models: ${r.status}, ${l}`));
  const count = (status) => results.filter((r) => r.status === status).length;
  lines.push(
    `check-served-models: ${spawns.length} subagent(s): ${count('ok')} match, ${count('mismatch')} mismatch, ${count('untagged')} untagged`
  );
  return { lines, exitCode: bad.length > 0 ? 1 : 0 };
}

module.exports = { ROLE_TAG, roleTag, seatFor, servedModels, checkSpawn, run };
