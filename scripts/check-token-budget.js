// scripts/check-token-budget.js
// CI gate: the readable tree stays under the total token budget and every reviewer's fixed
// reading stays under the reviewer budget. Counting lives in check-token-budget-core.js.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { run } = require('./check-token-budget-core');

const REPO_ROOT = path.join(__dirname, '..');
const NEW_TREE = path.join(REPO_ROOT, 'new-tree.json');
const NOT_COUNTED = (file) =>
  file === 'BUILDLOG.md' || file === 'DESIGN.md' || file.startsWith('buildlog/');

function main() {
  let files;
  let pending = {};
  if (fs.existsSync(NEW_TREE)) {
    const tree = JSON.parse(fs.readFileSync(NEW_TREE, 'utf8'));
    files = tree.files.map((f) => f.path);
    for (const p of tree.pending || []) pending[p.path] = p.budget;
  } else {
    const listed = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' });
    files = listed.split('\n').filter(Boolean);
  }
  files = files.filter((f) => !NOT_COUNTED(f));

  const { lines, exitCode } = run(
    files,
    (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'),
    pending
  );
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

if (require.main === module) {
  main();
}
