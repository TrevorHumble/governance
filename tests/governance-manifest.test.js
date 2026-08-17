// tests/governance-manifest.test.js
// Mechanizes AC5's "no entry names an absent file" promise for
// governance-manifest.json: every declared sharedPaths entry must resolve to
// at least one existing file in the tree. A prose sync guarantee shipped
// without a guard is exactly the kind of silent-drift risk this repo exists
// to avoid (see docs/seed-classification-2026-08-16.md, "Hazards").
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'governance-manifest.json');

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
    const excluded = [
      'package.json',
      'package-lock.json',
      'vitest.config.mjs',
      '.prettierrc.json',
      '.gitignore',
      '.github/workflows/ci.yml',
      'tests/**',
      'README.md',
      'BUILDLOG.md',
      'docs/**',
      'repo-profile.json',
      'CLAUDE.md',
      'CLAUDE.local.md',
      'governance-manifest.json',
    ];
    for (const entry of excluded) {
      expect(manifest.sharedPaths).not.toContain(entry);
    }
  });
});
