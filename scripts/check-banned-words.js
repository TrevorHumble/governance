// scripts/check-banned-words.js
// CI gate: no file in the new tree, vendored skill, BUILDLOG.md, or buildlog fragment holds a
// banned phrase, and no file in the new tree holds a banned filler word. Matching lives in
// check-banned-words-core.js; which files are the new tree is answered by the budget gate
// (countInputs in check-token-budget-core.js); this file reads disk.
//
//   node scripts/check-banned-words.js
'use strict';

const fs = require('fs');
const path = require('path');
const { findBannedWords } = require('./check-banned-words-core');
const { countInputs, VENDOR_ROOT } = require('./check-token-budget-core');
const { readHead } = require('./check-token-budget');

const REPO_ROOT = path.join(__dirname, '..');

function scanSet(root) {
  const { view } = readHead(root);
  const inTree = new Set(countInputs(view).files);
  const scan = [];
  for (const p of view.listing) {
    if (inTree.has(p)) scan.push({ path: p, scope: 'all' });
    else if (p.startsWith(VENDOR_ROOT) || p === 'BUILDLOG.md' || p.startsWith('buildlog/')) {
      scan.push({ path: p, scope: 'phrases' });
    }
  }
  return scan;
}

function main({ root = REPO_ROOT } = {}) {
  let files;
  try {
    files = scanSet(root).map((f) => ({
      ...f,
      text: fs.readFileSync(path.join(root, f.path), 'utf8'),
    }));
  } catch (err) {
    return {
      lines: [`banned words: FAIL, cannot read the files to check (${err.message}).`],
      exitCode: 1,
    };
  }
  const hits = findBannedWords(files);
  if (hits.length === 0) {
    return { lines: [`banned words: clean (${files.length} files checked)`], exitCode: 0 };
  }
  const lines = hits.map((h) => `${h.path}:${h.line}: banned word "${h.word}"`);
  const count = new Set(hits.map((h) => h.path)).size;
  lines.push(`banned words: ${hits.length} hit(s) in ${count} file(s)`);
  return { lines, exitCode: 1 };
}

if (require.main === module) {
  const { lines, exitCode } = main();
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

module.exports = { main };
