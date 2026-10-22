// scripts/check-seats.js
// CI gate: seats.json holds every rule (a seat per role, known providers and efforts, models that
// differ where independence needs it, agents, skills and lenses that name real files, no model ID
// in shared markdown), and a PR that changes only seat values is reported as
// seats-only with a before/after table for the owner. The rules live in check-seats-core.js; this
// file reads disk and git. The base comes from the budget gate's handling of --base and CI events.
//
//   node scripts/check-seats.js [--base <ref>]
'use strict';

const fs = require('fs');
const path = require('path');
const { run, failLine } = require('./check-seats-core');
const { isSharedPath } = require('./check-token-budget-core');
const { baseRef, git, changedFiles } = require('./check-token-budget');

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

// What the file-name and model-ID rules read: the tracked files, the profile's lenses, and the text
// of every shared .md file. A missing manifest or profile is an error, never "nothing to check".
function readRefs(root) {
  const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const manifest = readJson('governance-manifest.json');
  const profile = readJson('repo-profile.json');
  const tracked = git(root, ['ls-files']).split('\n').filter(Boolean);
  const sharedMarkdown = tracked
    .filter((f) => f.endsWith('.md') && isSharedPath(f, manifest.sharedPaths))
    .map((f) => ({ path: f, text: fs.readFileSync(path.join(root, f), 'utf8') }));
  return { tracked, lenses: profile.lenses ?? [], sharedMarkdown };
}

function main({ root = REPO_ROOT, argv = process.argv.slice(2), env = process.env } = {}) {
  let headSeats;
  try {
    headSeats = JSON.parse(fs.readFileSync(path.join(root, SEATS_FILE), 'utf8'));
  } catch (err) {
    return fail(`cannot read ${SEATS_FILE} (${err.message}).`);
  }

  let refs;
  try {
    refs = readRefs(root);
  } catch (err) {
    return fail(`cannot read the files the name checks need (${err.message}).`);
  }

  const found = baseRef(argv, env);
  if (found.error) return fail(found.error);
  if (!found.ref) return run(headSeats, undefined, refs);

  try {
    git(root, ['rev-parse', '--verify', '--quiet', `${found.ref}^{commit}`]);
  } catch {
    return fail(`the base ${found.ref} does not resolve to a commit.`);
  }
  let changed;
  try {
    changed = changedFiles(root, found.ref);
  } catch (err) {
    return fail(
      `cannot list the files changed since ${found.ref} (${err.message.split('\n')[0]}).`
    );
  }
  return run(
    headSeats,
    { ref: found.ref, baseSeats: readBaseSeats(root, found.ref), changed },
    refs
  );
}

if (require.main === module) {
  const { lines, exitCode } = main();
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

module.exports = { main };
