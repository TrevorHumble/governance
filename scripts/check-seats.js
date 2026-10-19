// scripts/check-seats.js
// CI gate: seats.json holds every rule (a seat per role, known providers and efforts, models that
// differ where independence needs it), and a PR that changes only seat values is reported as
// seats-only with a before/after table for the owner. The rules live in check-seats-core.js; this
// file reads disk and git. The base comes from the budget gate's handling of --base and CI events.
//
//   node scripts/check-seats.js [--base <ref>]
'use strict';

const fs = require('fs');
const path = require('path');
const { run, failLine } = require('./check-seats-core');
const { baseRef, git, gitLines } = require('./check-token-budget');

const REPO_ROOT = path.join(__dirname, '..');
const SEATS_FILE = 'seats.json';

const fail = (text) => ({ lines: [failLine(text)], exitCode: 1 });

// The base's seats.json, or undefined when it is absent or unparseable there: a PR that adds or
// repairs the file is then simply not seats-only, rather than failing on the base's state.
function readBaseSeats(root, ref) {
  try {
    return JSON.parse(git(root, ['show', `${ref}:${SEATS_FILE}`]));
  } catch {
    return undefined;
  }
}

function main({ root = REPO_ROOT, argv = process.argv.slice(2), env = process.env } = {}) {
  let headSeats;
  try {
    headSeats = JSON.parse(fs.readFileSync(path.join(root, SEATS_FILE), 'utf8'));
  } catch (err) {
    return fail(`cannot read ${SEATS_FILE} (${err.message}).`);
  }

  const found = baseRef(argv, env);
  if (found.error) return fail(found.error);
  if (!found.ref) return run(headSeats);

  try {
    git(root, ['rev-parse', '--verify', '--quiet', `${found.ref}^{commit}`]);
  } catch {
    return fail(`the base ${found.ref} does not resolve to a commit.`);
  }
  let changed;
  try {
    changed = gitLines(root, ['diff', '--name-only', `${found.ref}...HEAD`]);
  } catch (err) {
    return fail(
      `cannot list the files changed since ${found.ref} (${err.message.split('\n')[0]}).`
    );
  }
  return run(headSeats, { ref: found.ref, baseSeats: readBaseSeats(root, found.ref), changed });
}

if (require.main === module) {
  const { lines, exitCode } = main();
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

module.exports = { main };
