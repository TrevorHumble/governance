// tests/governance-manifest.test.js
// Mechanizes AC5's "no entry names an absent file" promise for
// governance-manifest.json: every declared sharedPaths entry must resolve to
// at least one existing file in the tree. A prose sync guarantee shipped
// without a guard is exactly the kind of silent-drift risk this repo exists
// to avoid (see docs/seed-classification-2026-08-16.md, "Hazards").
//
// The shared/excluded partition is single-homed in governance-manifest.json
// itself (`sharedPaths` and `excludedPaths`), not restated here: this file
// reads both arrays from the manifest rather than carrying its own copy
// (`DESIGN.md` § "governance-manifest.json semantics").
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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

/** True when `file` is matched by any entry in `sharedPaths`. */
function isShared(file, sharedPaths) {
  return sharedPaths.some((entry) => fileMatchesEntry(file, entry));
}

/**
 * True when `file` is matched by `excludedPaths`, gitignore-style: entries
 * are applied in order, a plain entry adds the file to the excluded set, a
 * `!`-prefixed entry removes it. This lets a broad entry (e.g. "buildlog/**")
 * exclude a whole directory while a later negation (e.g. "!buildlog/README.md")
 * carves out the one file that is separately a sharedPaths entry, without the
 * two arrays ever both claiming the same file (see DESIGN.md § "governance-
 * manifest.json semantics").
 */
function isExcluded(file, excludedPaths) {
  let excluded = false;
  for (const raw of excludedPaths) {
    if (raw.startsWith('!')) {
      if (fileMatchesEntry(file, raw.slice(1))) excluded = false;
    } else if (fileMatchesEntry(file, raw)) {
      excluded = true;
    }
  }
  return excluded;
}

describe('governance-manifest.json', () => {
  it('parses as JSON', () => {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('has a `retired` array (present, per AC5), a `sharedPaths` array, and an `excludedPaths` array', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(Array.isArray(manifest.retired)).toBe(true);
    expect(Array.isArray(manifest.sharedPaths)).toBe(true);
    expect(manifest.sharedPaths.length).toBeGreaterThan(0);
    expect(Array.isArray(manifest.excludedPaths)).toBe(true);
    expect(manifest.excludedPaths.length).toBeGreaterThan(0);
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
    for (const entry of manifest.excludedPaths) {
      if (entry.startsWith('!')) continue; // a negation carves shared territory back out, not a shared-list entry
      expect(manifest.sharedPaths).not.toContain(entry);
    }
  });

  // Reverse-coverage: AC5 guards sharedPaths -> real file (above), but says
  // nothing about the other direction. A new governance file (standard,
  // agent, tool, hook) that lands in neither sharedPaths nor excludedPaths
  // would silently never reach a child repo on sync, with no test failure to
  // catch it. This test closes that gap in both directions at once: every
  // tracked file must be claimed by exactly one of the two lists, never
  // neither (would silently drop the file from sync) and never both (would
  // hide a misclassification, as buildlog/README.md's overlap with the old
  // blanket "buildlog/**" exclusion did before this manifest gained
  // excludedPaths -- see DESIGN.md § "governance-manifest.json semantics").
  it('every tracked file matches exactly one of sharedPaths or excludedPaths', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const tracked = listTrackedFiles();
    const neither = [];
    const both = [];
    for (const file of tracked) {
      const shared = isShared(file, manifest.sharedPaths);
      const excluded = isExcluded(file, manifest.excludedPaths);
      if (!shared && !excluded) neither.push(file);
      if (shared && excluded) both.push(file);
    }
    expect(neither).toEqual([]);
    expect(both).toEqual([]);
  });

  // Concrete regression case for the overlap this test class exists to catch:
  // buildlog/README.md is a sharedPaths entry (the template is shared) sitting
  // inside the buildlog/** directory excludedPaths also covers (the fragments
  // are not shared). The "!buildlog/README.md" negation must carve it back out
  // of excludedPaths so it lands in exactly the shared set.
  it('buildlog/README.md is shared, not excluded, despite sitting under the excluded buildlog/** prefix', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(isShared('buildlog/README.md', manifest.sharedPaths)).toBe(true);
    expect(isExcluded('buildlog/README.md', manifest.excludedPaths)).toBe(false);
  });

  // Mutation-coverage: a real tracked file matched by neither list must be
  // caught, proving the reverse-coverage test doesn't just vacuously pass.
  it('rejects a tracked-file-shaped path covered by neither sharedPaths nor excludedPaths', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const phantom = 'not-a-real-governance-file.md';
    expect(isShared(phantom, manifest.sharedPaths)).toBe(false);
    expect(isExcluded(phantom, manifest.excludedPaths)).toBe(false);
  });

  // Mutation-coverage: a phantom file inside the excluded buildlog/** prefix
  // (but not the negated README.md) must be caught, proving isExcluded
  // doesn't just return false for everything post-negation.
  it('a hypothetical buildlog fragment other than README.md is excluded', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(isExcluded('buildlog/99-phantom-fragment.md', manifest.excludedPaths)).toBe(true);
  });
});
