// scripts/check-emdash.js
// CI gate: rejects a PR whose added lines carry an em dash or entity form.
// (Ported from the wedding-scavenger-hunt repo's issue #1171.)
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { findEmdashViolations, hasRevertMarker } = require('./check-emdash-core');

// ESCAPE_HINT is assembled from a code point, not typed as a template-string
// escape, so this file's source text never contains the sequence it prints.
const BACKSLASH = String.fromCharCode(0x5c);
const ESCAPE_HINT = `${BACKSLASH}u2014`;

// Named so the ENOBUFS message below and the maxBuffer option can never
// disagree about what the cap actually is.
const MAX_BUFFER_BYTES = 256 * 1024 * 1024;

// DEFAULT_BRANCH_FALLBACK: this file's one copy of the 'main' fallback value.
// tools/repo-profile-core.ps1's $FieldDefaults table is the PowerShell-side
// owner of the same fallback for every PowerShell tool; a Node script cannot
// dot-source a `.ps1` file, so this stays the one sanctioned cross-language
// copy.
const DEFAULT_BRANCH_FALLBACK = 'main';

/**
 * Reads `defaultBranch` from this repo's `repo-profile.json`, resolved
 * relative to this script's own location so it works regardless of the
 * caller's working directory. Fails soft to `DEFAULT_BRANCH_FALLBACK` if the
 * profile file is missing, unreadable, or the field is absent -- this check
 * must never crash for a missing or incomplete profile.
 * @returns {string}
 */
function readDefaultBranch() {
  try {
    const profilePath = path.join(__dirname, '..', 'repo-profile.json');
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    return profile.defaultBranch || DEFAULT_BRANCH_FALLBACK;
  } catch (err) {
    return DEFAULT_BRANCH_FALLBACK;
  }
}

/**
 * Run git and return stdout, or throw with a message naming the failure.
 * Never returns a partial/guessed result on failure.
 * @param {string[]} args
 * @returns {string}
 */
function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: MAX_BUFFER_BYTES });
  if (result.error) {
    if (result.error.code === 'ENOBUFS') {
      throw new Error(
        `git ${args.join(' ')} produced more output than the ${MAX_BUFFER_BYTES / (1024 * 1024)} MiB buffer cap allows. git did start and run; only its output exceeded the configured limit. Narrow EMDASH_BASE or raise maxBuffer in scripts/check-emdash.js.`
      );
    }
    throw new Error(`git ${args.join(' ')} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} exited ${result.status}: ${String(result.stderr || '').trim()}`
    );
  }
  return result.stdout;
}

function main() {
  const base = process.env.EMDASH_BASE || `origin/${readDefaultBranch()}`;

  let logText;
  try {
    logText = runGit(['log', `${base}..HEAD`, '--format=%B']);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  if (hasRevertMarker(logText)) {
    console.log(
      `check-emdash: revert marker found in ${base}..HEAD -- skipping the em-dash check for this range (revert escape).`
    );
    process.exitCode = 0;
    return;
  }

  let diffText;
  try {
    diffText = runGit(['diff', '--no-color', '-U0', `${base}...HEAD`]);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const violations = findEmdashViolations(diffText);
  if (violations.length === 0) {
    console.log('check-emdash: no added em dashes found.');
    process.exitCode = 0;
    return;
  }

  for (const v of violations) {
    console.log(`${v.file}:${v.line}`);
    console.log(
      `  remedy: rewrite the line without the em dash, or spell it as the ${ESCAPE_HINT} escape in source and test fixtures.`
    );
  }
  console.error(`check-emdash: ${violations.length} added em-dash line(s) found.`);
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}
