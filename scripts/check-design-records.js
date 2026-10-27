// scripts/check-design-records.js
// Gate on a design file's shape: the header it opens with, and each record's date and issue line,
// `Decided:`, `Why:` and `Gave up:` lines, and length. The rules live in
// check-design-records-core.js; this file reads the file.
//
//   node scripts/check-design-records.js <design file>
'use strict';

const fs = require('fs');
const { run, failLine } = require('./check-design-records-core');

function main({ argv = process.argv.slice(2) } = {}) {
  const args = argv.filter((a) => a !== '--');
  if (args.length !== 1 || args[0].startsWith('--')) {
    return { lines: [failLine('usage: check-design-records.js <design file>')], exitCode: 1 };
  }
  let text;
  try {
    text = fs.readFileSync(args[0], 'utf8');
  } catch (err) {
    return { lines: [failLine(`cannot read ${args[0]} (${err.message}).`)], exitCode: 1 };
  }
  return run({ text, path: args[0] });
}

if (require.main === module) {
  const { lines, exitCode } = main();
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

module.exports = { main };
