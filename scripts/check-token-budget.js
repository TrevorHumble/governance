// scripts/check-token-budget.js
// CI gate: the readable tree stays under the total token budget and every reviewer's fixed
// reading stays under the reviewer budget, and a change to the budget itself is a change of its own.
// Counting and the guard rules live in check-token-budget-core.js; this file reads git and disk.
//
//   node scripts/check-token-budget.js [--base <ref>]
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  run,
  countInputs,
  guardedChanges,
  guardFailures,
  isCap,
  failLine,
  VENDOR_ROOT,
} = require('./check-token-budget-core');

const REPO_ROOT = path.join(__dirname, '..');
// A base that predates the `budget` key in repo-profile.json is read with the values it ran under.
const LEGACY_BUDGET = {
  total: 25000,
  reviewer: 10000,
  notCounted: ['BUILDLOG.md', 'DESIGN.md', 'buildlog/'],
};

const fail = (text) => ({ lines: [failLine(text)], exitCode: 1 });

function git(root, args) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
const gitLines = (root, args) => git(root, args).split('\n').filter(Boolean);
// Files a PR changes since the base. --no-renames lists a rename's source as well as its
// destination, so a file moved into a ride-along folder cannot hide.
const changedFiles = (root, ref) =>
  gitLines(root, ['diff', '--name-only', '--no-renames', `${ref}...HEAD`]);

function baseRef(argv, env) {
  const at = argv.findIndex((a) => a === '--base' || a.startsWith('--base='));
  if (at !== -1) {
    const ref = argv[at].startsWith('--base=') ? argv[at].slice('--base='.length) : argv[at + 1];
    return ref ? { ref } : { error: '--base needs a ref.' };
  }
  if (env.GITHUB_EVENT_NAME === 'pull_request') {
    return env.GITHUB_BASE_REF
      ? { ref: `origin/${env.GITHUB_BASE_REF}` }
      : { error: 'a pull_request event with no GITHUB_BASE_REF, so no base to compare with.' };
  }
  if (env.GITHUB_EVENT_NAME === 'merge_group') {
    try {
      const sha = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')).merge_group.base_sha;
      if (sha) return { ref: sha };
    } catch {
      // An unreadable payload is reported as a missing base below.
    }
    return { error: 'a merge_group event whose payload (GITHUB_EVENT_PATH) has no base_sha.' };
  }
  return { ref: null };
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

function vendorHashes(root) {
  const top = path.join(root, VENDOR_ROOT);
  if (!fs.existsSync(top)) return {};
  const hashes = {};
  for (const full of walk(top)) {
    const rel = path.relative(root, full).split(path.sep).join('/');
    hashes[rel] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  }
  return hashes;
}

function readLibrary(root) {
  const file = path.join(root, 'reviewer-library.json');
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  // A malformed library is an error, never "no library": that would switch every library check off.
  if (!parsed || !Array.isArray(parsed.entries)) throw new Error('"entries" must be an array');
  return parsed.entries;
}

function notCountedOf(budget, where) {
  const list = budget.notCounted ?? [];
  if (!Array.isArray(list) || !list.every((e) => typeof e === 'string')) {
    throw new Error(`budget.notCounted in ${where} must be an array of strings`);
  }
  return list;
}

// The manifest's shared paths decide what counts. Each side is filtered by its own manifest, so a
// PR that drops a path from sharedPaths shows up as a file that leaves the count.
function sharedPathsOf(manifest, where) {
  if (
    !Array.isArray(manifest.sharedPaths) ||
    !manifest.sharedPaths.every((e) => typeof e === 'string')
  ) {
    throw new Error(`sharedPaths in governance-manifest.json ${where} must be an array of strings`);
  }
  return manifest.sharedPaths;
}

function readHead(root) {
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'repo-profile.json'), 'utf8'));
  const budget = profile.budget || {};
  return {
    profile,
    caps: { total: budget.total, reviewer: budget.reviewer },
    view: {
      listing: gitLines(root, ['ls-files']),
      notCounted: notCountedOf(budget, 'repo-profile.json'),
      sharedPaths: sharedPathsOf(
        JSON.parse(fs.readFileSync(path.join(root, 'governance-manifest.json'), 'utf8')),
        'on the head'
      ),
    },
  };
}

// The base's data, from git alone. An unreadable file is an error, never "no budget key".
function readBase(root, ref, headSharedPaths) {
  const show = (file) => git(root, ['show', `${ref}:${file}`]);
  const listing = gitLines(root, ['ls-tree', '-r', '--name-only', ref]);
  let profile;
  try {
    profile = JSON.parse(show('repo-profile.json'));
  } catch (err) {
    throw new Error(`cannot read repo-profile.json at ${ref} (${err.message.split('\n')[0]})`, {
      cause: err,
    });
  }
  // A base that predates the manifest is counted by the head's shared paths.
  let sharedPaths = headSharedPaths;
  if (listing.includes('governance-manifest.json')) {
    try {
      sharedPaths = sharedPathsOf(JSON.parse(show('governance-manifest.json')), `at ${ref}`);
    } catch (err) {
      throw new Error(
        `cannot read governance-manifest.json at ${ref} (${err.message.split('\n')[0]})`,
        { cause: err }
      );
    }
  }
  const budget = profile.budget || LEGACY_BUDGET;
  if (!isCap(budget.total) || !isCap(budget.reviewer)) {
    throw new Error(`the budget caps in repo-profile.json at ${ref} are not numbers`);
  }
  return {
    profile,
    guarded: 'budget' in profile,
    caps: { total: budget.total, reviewer: budget.reviewer },
    view: { listing, notCounted: notCountedOf(budget, `repo-profile.json at ${ref}`), sharedPaths },
    read: (file) => show(file),
  };
}

function main({ root = REPO_ROOT, argv = process.argv.slice(2), env = process.env } = {}) {
  let head;
  try {
    head = readHead(root);
  } catch (err) {
    return fail(`cannot read the head's budget data (${err.message}).`);
  }

  const found = baseRef(argv, env);
  if (found.error) return fail(found.error);

  let baseCounts;
  const extra = {};
  const guardLines = [];
  if (found.ref) {
    try {
      git(root, ['rev-parse', '--verify', '--quiet', `${found.ref}^{commit}`]);
    } catch {
      return fail(`the base ${found.ref} does not resolve to a commit.`);
    }
    try {
      const base = readBase(root, found.ref, head.view.sharedPaths);
      baseCounts = run(countInputs(base.view), base.read, base.caps);
      if (base.guarded) {
        const changed = changedFiles(root, found.ref);
        guardLines.push(
          ...guardFailures(guardedChanges(base, head), changed, base.profile, head.profile)
        );
      }
    } catch (err) {
      return fail(err.message);
    }
    extra.base = { ref: found.ref, total: baseCounts.total, reviewers: baseCounts.reviewers };
  }

  let library;
  try {
    library = readLibrary(root);
  } catch (err) {
    return fail(`cannot read reviewer-library.json (${err.message}).`);
  }
  const result = run(
    countInputs(head.view),
    (f) => fs.readFileSync(path.join(root, f), 'utf8'),
    head.caps,
    {
      ...extra,
      library,
      vendorHashes: vendorHashes(root),
      tracked: new Set(head.view.listing),
    }
  );
  return {
    lines: [...result.lines, ...guardLines],
    exitCode: result.exitCode || guardLines.length > 0 ? 1 : 0,
  };
}

if (require.main === module) {
  const { lines, exitCode } = main();
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

module.exports = { main, readHead, baseRef, git, changedFiles };
