// tests/governance-manifest.test.js
// Mechanizes AC5's "no entry names an absent file" promise for
// governance-manifest.json: every declared sharedPaths entry must resolve to
// at least one existing file in the tree. A prose sync guarantee shipped
// without a guard is exactly the kind of silent-drift risk this repo exists
// to avoid (see docs/seed-classification-2026-08-16.md, "Hazards").
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'governance-manifest.json');

/**
 * This repo's own build and record files: deliberately excluded from
 * `sharedPaths` per `governance-manifest.json`'s documented semantics
 * (`DESIGN.md` § "governance-manifest.json semantics"). Single-homed here so
 * both the "excludes this repo's own files" test and the reverse-coverage
 * test below read the same list; a file belongs in exactly one of
 * `sharedPaths` or this array, never neither.
 */
const EXCLUDED = [
  'package.json',
  'package-lock.json',
  'vitest.config.mjs',
  '.prettierrc.json',
  '.gitignore',
  '.github/**',
  'tests/**',
  'README.md',
  'BUILDLOG.md',
  'buildlog/**',
  'docs/**',
  'repo-profile.json',
  'CLAUDE.md',
  'CLAUDE.local.md',
  'DESIGN.md',
  'governance-manifest.json',
];

/** Recursively list every file under dir, relative to REPO_ROOT, forward-slashed. */
function listFilesUnder(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesUnder(full));
    } else if (entry.isFile()) {
      out.push(path.relative(REPO_ROOT, full).split(path.sep).join('/'));
    }
  }
  return out;
}

/**
 * True when `entry` resolves to at least one existing file. A `**`-suffixed
 * entry (e.g. "standards/**") resolves if the directory exists and contains
 * at least one file anywhere below it; any other entry resolves only as an
 * exact existing file path.
 */
function entryResolves(entry, allFiles) {
  if (entry.endsWith('/**')) {
    const prefix = entry.slice(0, -3); // drop the trailing "/**"
    return allFiles.some((f) => f === prefix || f.startsWith(`${prefix}/`));
  }
  return fs.existsSync(path.join(REPO_ROOT, entry));
}

/**
 * True when `file` is matched by `entry`: either an exact match, or, for a
 * `**`-suffixed entry, `file` equal to or nested under the entry's prefix
 * directory. The inverse direction of entryResolves above (that checks a
 * declared entry resolves to a real file; this checks a real file is
 * declared by some entry).
 */
function fileMatchesEntry(file, entry) {
  if (entry.endsWith('/**')) {
    const prefix = entry.slice(0, -3);
    return file === prefix || file.startsWith(`${prefix}/`);
  }
  return file === entry;
}

/** List every git-tracked file, relative to REPO_ROOT, forward-slashed. */
function listTrackedFiles() {
  const raw = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return raw.split('\n').filter(Boolean);
}

describe('governance-manifest.json', () => {
  it('parses as JSON', () => {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('has a `retired` array (present, per AC5) and a `sharedPaths` array', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(Array.isArray(manifest.retired)).toBe(true);
    expect(Array.isArray(manifest.sharedPaths)).toBe(true);
    expect(manifest.sharedPaths.length).toBeGreaterThan(0);
  });

  it('every sharedPaths entry resolves to at least one existing file in the tree', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const allFiles = listFilesUnder(REPO_ROOT).filter(
      (f) => !f.startsWith('node_modules/') && !f.startsWith('.git/') && !f.startsWith('data/')
    );
    const unresolved = manifest.sharedPaths.filter((entry) => !entryResolves(entry, allFiles));
    expect(unresolved).toEqual([]);
  });

  // Mutation-coverage: a `**` entry naming a directory that genuinely does not
  // exist must be caught, proving entryResolves doesn't just return true for
  // anything ending in "/**".
  it('rejects a sharedPaths-shaped entry naming a directory this repo does not have', () => {
    const allFiles = listFilesUnder(REPO_ROOT);
    expect(entryResolves('does-not-exist-dir/**', allFiles)).toBe(false);
  });

  it("excludes this repo's own build and record files, per AC5", () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    for (const entry of EXCLUDED) {
      expect(manifest.sharedPaths).not.toContain(entry);
    }
  });

  // Reverse-coverage: AC5 guards sharedPaths -> real file (above), but says
  // nothing about the other direction. A new governance file (standard,
  // agent, tool, hook) that lands in neither sharedPaths nor the EXCLUDED
  // record above would silently never reach a child repo on sync, with no
  // test failure to catch it. This test closes that gap: every tracked file
  // must be claimed by one list or the other.
  it('every tracked file is covered by sharedPaths or the EXCLUDED record, with none uncovered', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const tracked = listTrackedFiles();
    const uncovered = tracked.filter(
      (file) =>
        !manifest.sharedPaths.some((entry) => fileMatchesEntry(file, entry)) &&
        !EXCLUDED.some((entry) => fileMatchesEntry(file, entry))
    );
    expect(uncovered).toEqual([]);
  });

  // Mutation-coverage: a real tracked file matched by neither list must be
  // caught, proving the reverse-coverage test doesn't just vacuously pass.
  it('rejects a tracked-file-shaped path covered by neither sharedPaths nor EXCLUDED', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const phantom = 'not-a-real-governance-file.md';
    const covered =
      manifest.sharedPaths.some((entry) => fileMatchesEntry(phantom, entry)) ||
      EXCLUDED.some((entry) => fileMatchesEntry(phantom, entry));
    expect(covered).toBe(false);
  });
});
