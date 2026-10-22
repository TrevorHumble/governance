// scripts/check-review-evidence.js
// Gate before a PASS is accepted at step 09: the saved review is of the code as it is now, and
// every file:line it cites exists. The rules live in check-review-evidence-core.js; this file
// reads disk and git.
//
//   node scripts/check-review-evidence.js --tree            print the working-tree id
//   node scripts/check-review-evidence.js <review file>     check a saved review against it
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { run, failLine } = require('./check-review-evidence-core');

const REPO_ROOT = path.join(__dirname, '..');

const fail = (text) => ({ lines: [failLine(text)], exitCode: 1 });

function git(root, args, env = process.env) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * The id of the working tree: the tree of a temporary index holding every tracked and untracked
 * file that is not ignored. It changes whenever one of those files changes, which HEAD^{tree} does
 * not until a commit. The repo's own index is not touched.
 * @param {string} root the repo root
 * @returns {string}
 */
function workingTreeId(root) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-tree-'));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: path.join(dir, 'index') };
    git(root, ['add', '-A'], env);
    return git(root, ['write-tree'], env).trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Paths a citation may name: tracked files plus untracked ones that are not ignored. Step 09 reviews
// the working tree before any commit, so a file the change adds is untracked.
function citablePaths(root) {
  const out = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  return new Set(out.split('\0').filter(Boolean));
}

const slashes = (p) => p.replace(/\\/g, '/');
const isAbsolute = (p) => /^(?:[A-Za-z]:)?\//.test(p);

// The repo-relative form of an absolute path inside the repo, or undefined for any other. The root
// is tried as given and as its real path, since a reviewer may cite either.
function underRoot(root, abs) {
  const roots = new Set([slashes(root)]);
  try {
    roots.add(slashes(fs.realpathSync(root)));
  } catch {
    // An unresolvable root leaves only the given form.
  }
  const fold = process.platform === 'win32' ? (t) => t.toLowerCase() : (t) => t;
  for (const r of roots) {
    const base = r.replace(/\/+$/, '') + '/';
    if (fold(abs).startsWith(fold(base))) return abs.slice(base.length);
  }
  return undefined;
}

function countLines(full) {
  let text;
  try {
    if (!fs.statSync(full).isFile()) return undefined;
    text = fs.readFileSync(full, 'utf8');
  } catch {
    return undefined;
  }
  if (text === '') return 0;
  const breaks = text.split('\n').length - 1;
  return text.endsWith('\n') ? breaks : breaks + 1;
}

// Resolves a citation's path to a file of the working tree. An absolute path counts only inside the
// repo; a bare name only when exactly one citable file has it.
function resolver(root) {
  const paths = citablePaths(root);
  const byName = new Map();
  for (const p of paths) {
    const name = p.slice(p.lastIndexOf('/') + 1);
    byName.set(name, [...(byName.get(name) ?? []), p]);
  }
  return (cited) => {
    let rel = cited;
    if (isAbsolute(cited)) {
      rel = underRoot(root, cited);
      if (rel === undefined) return { problem: `${cited} is an absolute path outside the repo` };
    } else if (!cited.includes('/')) {
      const same = byName.get(cited) ?? [];
      if (same.length > 1) {
        return { problem: `${cited} is ambiguous (${same.join(', ')}); cite the repo path` };
      }
      rel = same[0] ?? cited;
    }
    const lines = paths.has(rel) ? countLines(path.join(root, rel)) : undefined;
    return lines === undefined
      ? { problem: `${rel} is not a file in the working tree` }
      : { lines };
  };
}

function main({ root = REPO_ROOT, argv = process.argv.slice(2) } = {}) {
  const args = argv.filter((a) => a !== '--');
  try {
    if (args.length === 1 && args[0] === '--tree') {
      return { lines: [workingTreeId(root)], exitCode: 0 };
    }
    if (args.length !== 1 || args[0].startsWith('--')) {
      return fail('usage: check-review-evidence.js --tree | <review file>');
    }
    let review;
    try {
      review = fs.readFileSync(args[0], 'utf8');
    } catch (err) {
      return fail(`cannot read the review file ${args[0]} (${err.message}).`);
    }
    return run({ review, currentTree: workingTreeId(root), resolve: resolver(root) });
  } catch (err) {
    return fail(`git failed (${err.message.split('\n')[0]}).`);
  }
}

if (require.main === module) {
  const { lines, exitCode } = main();
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

module.exports = { main, workingTreeId };
