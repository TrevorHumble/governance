// scripts/check-skills.js
// CI gate on every .claude/skills/<name>/SKILL.md: the limits a skill needs to load, and the
// token ceiling for counted skills. The rules live in check-skills-core.js; this file reads files.
//
//   node scripts/check-skills.js
'use strict';

const fs = require('fs');
const path = require('path');
const { run, failLine } = require('./check-skills-core');
const { notCountedOf, manifestNotCountedOf } = require('./check-token-budget');

const REPO_ROOT = path.join(__dirname, '..');
const SKILLS_DIR = '.claude/skills';

function readJson(root, file) {
  const full = path.join(root, file);
  return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, 'utf8')) : {};
}

function main({ root = REPO_ROOT } = {}) {
  let notCounted;
  try {
    const profile = readJson(root, 'repo-profile.json');
    const manifest = readJson(root, 'governance-manifest.json');
    notCounted = [
      ...notCountedOf(profile.budget || {}, 'repo-profile.json'),
      ...manifestNotCountedOf(manifest, 'on the head'),
    ];
  } catch (err) {
    return {
      lines: [failLine(`cannot read the not-counted lists (${err.message}).`)],
      exitCode: 1,
    };
  }
  const dir = path.join(root, SKILLS_DIR);
  const skills = [];
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
    const rel = `${SKILLS_DIR}/${name}/SKILL.md`;
    const full = path.join(root, rel);
    if (fs.existsSync(full)) skills.push({ path: rel, text: fs.readFileSync(full, 'utf8') });
  }
  return run(skills, notCounted);
}

if (require.main === module) {
  const { lines, exitCode } = main();
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

module.exports = { main };
