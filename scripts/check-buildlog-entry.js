// scripts/check-buildlog-entry.js
// Checks one buildlog fragment the way the fold will, before it ships. Thin CLI over
// buildlog-glue-core.js's foldFragments, so the rules (shape, filename, number match, minimum
// length) live in one place. tools/ship.ps1 runs it on the fragment it writes.
// Usage: node scripts/check-buildlog-entry.js <path to buildlog/N-PR.md>
'use strict';

const fs = require('fs');
const path = require('path');
const { foldFragments } = require('./buildlog-glue-core');

const RULE_TEXT = {
  shape: 'the line does not match "- YYYY-MM-DD - #N <summary> (PR #M). <detail>"',
  filename: 'the file name is not <issue>-<PR>.md',
  'number-mismatch': "the line's #N does not match the issue number in the file name",
  stub: 'the entry is too short to say what shipped, why, and what CI confirmed',
};

/**
 * @param {string} file path to the fragment
 * @returns {{code: number, message: string}}
 */
function check(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { code: 1, message: `check-buildlog-entry: cannot read ${file}` };
  }
  const name = path.basename(file);
  const { rejected } = foldFragments('', [{ name, text }]);
  if (rejected.length === 0) return { code: 0, message: `check-buildlog-entry: ${name} ok` };
  const rule = rejected[0].rule;
  return {
    code: 1,
    message: `check-buildlog-entry: ${name} refused (${rule}): ${RULE_TEXT[rule] || rule}`,
  };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/check-buildlog-entry.js <buildlog/N-PR.md>');
    process.exitCode = 2;
  } else {
    const { code, message } = check(file);
    (code === 0 ? console.log : console.error)(message);
    process.exitCode = code;
  }
}

module.exports = { check };
