// scripts/check-file-size.js
// CI gate: fails a change that grows a file past the repo's line limit (fileSize in
// repo-profile.json). The rules live in check-file-size-core.js; this file asks git what changed.
//
//   node scripts/check-file-size.js              the PR's commits: <base>...HEAD
//   node scripts/check-file-size.js --worktree   uncommitted and new files too, for review
//   node scripts/check-file-size.js --base <ref> compare with <ref> instead
'use strict';

const fs = require('fs');
const path = require('path');
const { run, countLines, failLine } = require('./check-file-size-core');
const { isSharedPath } = require('./check-token-budget-core');
const { baseRef, git } = require('./check-token-budget');

const REPO_ROOT = path.join(__dirname, '..');

function readJson(root, file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  } catch {
    return {};
  }
}

// Git's own test for binary: a NUL byte in the first 8,000 bytes. numstat applies it to diffed
// files; an untracked file needs the same question asked here.
function isBinary(full) {
  try {
    const fd = fs.openSync(full, 'r');
    const buf = Buffer.alloc(8000);
    const n = fs.readSync(fd, buf, 0, 8000, 0);
    fs.closeSync(fd);
    return buf.subarray(0, n).includes(0);
  } catch {
    return false;
  }
}

// `git diff --numstat -z` records: added, tab, deleted, tab, path, NUL. A binary file shows "-".
function parseNumstat(out) {
  return out
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const [added, deleted, ...rest] = record.split('\t');
      return { path: rest.join('\t'), added: Number(added), deleted: Number(deleted) };
    });
}

function main({ root = REPO_ROOT, argv = process.argv.slice(2), env = process.env } = {}) {
  const profile = readJson(root, 'repo-profile.json');
  const found = baseRef(argv, env);
  if (found.error) return { lines: [failLine(found.error)], exitCode: 1 };
  const base = found.ref || `origin/${env.GITHUB_BASE_REF || profile.defaultBranch || 'main'}`;

  let changes;
  try {
    if (argv.includes('--worktree')) {
      const from = git(root, ['merge-base', base, 'HEAD']).trim();
      changes = parseNumstat(git(root, ['diff', '--numstat', '-z', '--no-renames', from]));
      const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
        .split('\0')
        .filter(Boolean);
      for (const file of untracked) {
        const binary = isBinary(path.join(root, file));
        changes.push({ path: file, added: binary ? NaN : Infinity, deleted: binary ? NaN : 0 });
      }
    } else {
      changes = parseNumstat(
        git(root, ['diff', '--numstat', '-z', '--no-renames', `${base}...HEAD`])
      );
    }
  } catch (err) {
    return {
      lines: [failLine(`cannot ask git what changed since ${base} (${err.message.trim()}).`)],
      exitCode: 1,
    };
  }

  // A child judges only its own files: shared files are judged, and allowed, in the parent.
  const sharedPaths = readJson(root, 'governance-manifest.json').sharedPaths;
  const ownedElsewhere =
    profile.governanceHome !== 'self' && Array.isArray(sharedPaths)
      ? (file) => isSharedPath(file, sharedPaths)
      : () => false;

  const lineCount = (file) => {
    try {
      return countLines(fs.readFileSync(path.join(root, file), 'utf8'));
    } catch {
      return null;
    }
  };
  return run({
    changes: changes.filter((c) => !ownedElsewhere(c.path)),
    lineCount,
    fileSize: profile.fileSize,
  });
}

if (require.main === module) {
  const { lines, exitCode } = main();
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

module.exports = { main, parseNumstat };
