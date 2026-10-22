// scripts/check-served-models.js
// Post-run check: for each subagent of a session, the model that served it equals its seat's model
// and the effort it was asked for equals its seat's effort. The rules live in
// check-served-models-core.js; this file reads disk. The orchestrator's own seat is not checked:
// its effort is recorded nowhere.
//
//   node scripts/check-served-models.js <session dir> [--seats <seats.json>]
//
// <session dir> is the folder that holds subagents/agent-*.jsonl and agent-*.meta.json (the
// subagents folder itself also works).
'use strict';

const fs = require('fs');
const path = require('path');
const { run } = require('./check-served-models-core');

const REPO_ROOT = path.join(__dirname, '..');
const META = /^agent-(.+)\.meta\.json$/;

const fail = (text) => ({ lines: [`check-served-models: FAIL, ${text}`], exitCode: 1 });

function parseArgs(argv) {
  const args = argv.filter((a) => a !== '--');
  let seatsFile = path.join(REPO_ROOT, 'seats.json');
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seats') seatsFile = args[++i];
    else if (args[i].startsWith('--seats=')) seatsFile = args[i].slice('--seats='.length);
    else rest.push(args[i]);
  }
  return { dir: rest.length === 1 ? rest[0] : undefined, seatsFile };
}

function main({ argv = process.argv.slice(2) } = {}) {
  const { dir, seatsFile } = parseArgs(argv);
  if (!dir || !seatsFile)
    return fail('usage: check-served-models.js <session dir> [--seats <file>]');

  let seats;
  try {
    seats = JSON.parse(fs.readFileSync(seatsFile, 'utf8'));
  } catch (err) {
    return fail(`cannot read ${seatsFile} (${err.message}).`);
  }

  const nested = path.join(dir, 'subagents');
  const folder = fs.existsSync(nested) ? nested : dir;
  let names;
  try {
    names = fs
      .readdirSync(folder)
      .map((f) => META.exec(f)?.[1])
      .filter(Boolean)
      .sort();
  } catch (err) {
    return fail(`cannot read ${folder} (${err.message}).`);
  }
  if (names.length === 0) return fail(`no agent-*.meta.json files in ${folder}.`);

  const spawns = [];
  for (const name of names) {
    let meta = null;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(folder, `agent-${name}.meta.json`), 'utf8'));
    } catch {
      // An unreadable meta is reported by the core as an untagged spawn with no description.
    }
    let transcript;
    try {
      transcript = fs.readFileSync(path.join(folder, `agent-${name}.jsonl`), 'utf8');
    } catch {
      // A missing transcript is reported by the core.
    }
    spawns.push({ name, meta, transcript });
  }
  return run(spawns, seats);
}

if (require.main === module) {
  const { lines, exitCode } = main();
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

module.exports = { main };
