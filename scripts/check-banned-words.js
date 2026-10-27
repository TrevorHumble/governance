// scripts/check-banned-words.js
// CI gate: no tracked .md file, vendored skill, BUILDLOG.md, or buildlog fragment holds a banned
// phrase, and no tracked .md file outside the vendored, build log and buildlog set holds a banned
// filler word. Matching lives in check-banned-words-core.js; this file reads disk and git.
//
//   node scripts/check-banned-words.js
'use strict';

const fs = require('fs');
const path = require('path');
const { findBannedWords } = require('./check-banned-words-core');
const { VENDOR_ROOT, UPSTREAM_COPY_PATHS, isNotCounted } = require('./check-token-budget-core');
const { git } = require('./check-token-budget');

const REPO_ROOT = path.join(__dirname, '..');

// Every tracked .md file is scanned, shared or not: the repo's own README, goals and records are
// prose the owner reads. Vendored skills, BUILDLOG.md and buildlog fragments get the phrases only.
// The upstream files copied byte for byte into the Impeccable skill folder are not scanned.
function scanSet(root) {
  const scan = [];
  for (const p of git(root, ['ls-files']).split('\n').filter(Boolean)) {
    if (isNotCounted(p, UPSTREAM_COPY_PATHS)) continue;
    if (p.startsWith(VENDOR_ROOT) || p === 'BUILDLOG.md' || p.startsWith('buildlog/')) {
      scan.push({ path: p, scope: 'phrases' });
    } else if (p.endsWith('.md')) {
      scan.push({ path: p, scope: 'all' });
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
