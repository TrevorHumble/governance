// tests/governance-manifest.test.js
// Mechanizes AC5's "no entry names an absent file" promise for
// governance-manifest.json: every declared sharedPaths entry must resolve to
// at least one existing file in the tree. A prose sync guarantee shipped
// without a guard is exactly the kind of silent-drift risk this repo exists
// to avoid (see docs/seed-classification-2026-08-16.md, "Hazards").
//
// The shared/excluded partition is single-homed in governance-manifest.json
// itself (`sharedPaths` and `excludedPaths`), not restated here: this file
// reads both arrays from the manifest rather than carrying its own copy.
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
  } catch {
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
 * Decodes one manifest path entry (the glob syntax `sharedPaths` and
 * `excludedPaths` both use) against a single candidate file. A `path/**`
 * entry matches the prefix itself or anything nested below it; any other
 * entry is a bare path, matched only by exact equality. Non-glob semantic,
 * picked once here: a bare entry names one specific file, which AC5 requires
 * to actually exist -- this function itself makes no filesystem call, so a
 * caller checking existence (entryResolves, below) does that by testing
 * against a real file listing, not by re-deciding the glob syntax.
 */
function matchesManifestEntry(file, entry) {
  if (entry.endsWith('/**')) {
    const prefix = entry.slice(0, -3); // drop the trailing "/**"
    return file === prefix || file.startsWith(`${prefix}/`);
  }
  return file === entry;
}

/**
 * True when `entry` resolves to at least one file in `allFiles`: for a
 * `**`-suffixed entry, anything under its prefix; for a bare entry, itself.
 */
function entryResolves(entry, allFiles) {
  return allFiles.some((f) => matchesManifestEntry(f, entry));
}

/** List every git-tracked file, relative to REPO_ROOT, forward-slashed. */
function listTrackedFiles() {
  const raw = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return raw.split('\n').filter(Boolean);
}

/** True when `file` is matched by any entry in `sharedPaths`. */
function isShared(file, sharedPaths) {
  return sharedPaths.some((entry) => matchesManifestEntry(file, entry));
}

/**
 * True when `file` is matched by `excludedPaths`, gitignore-style: entries
 * are applied in order, a plain entry adds the file to the excluded set, a
 * `!`-prefixed entry removes it. This lets a broad entry (e.g. "buildlog/**")
 * exclude a whole directory while a later negation (e.g. "!buildlog/README.md")
 * carves out the one file that is separately a sharedPaths entry, without the
 * two arrays ever both claiming the same file.
 */
function isExcluded(file, excludedPaths) {
  let excluded = false;
  for (const raw of excludedPaths) {
    if (raw.startsWith('!')) {
      if (matchesManifestEntry(file, raw.slice(1))) excluded = false;
    } else if (matchesManifestEntry(file, raw)) {
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
  // excludedPaths).
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

// Mechanizes AC 3's retired-entry schema: since the schema change ships in
// this issue (string entries become { path, sha256 } objects), a plain
// string must fail loudly rather than being silently accepted forever.
describe('retired entry schema (AC 3)', () => {
  /** True when `entry` is a well-formed retired-entry object. */
  function isValidRetiredEntry(entry) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return false;
    if (typeof entry.path !== 'string' || entry.path.length === 0) return false;
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) return false;
    return true;
  }

  it("the live manifest's retired array is entirely well-formed (passes today with [])", () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const invalid = manifest.retired.filter((e) => !isValidRetiredEntry(e));
    expect(invalid).toEqual([]);
  });

  // The exercised failing case: a plain-string entry, the old schema.
  it('rejects a plain-string retired entry', () => {
    expect(isValidRetiredEntry('tools/old-script.ps1')).toBe(false);
  });

  it('rejects an object entry whose sha256 is not 64 lowercase hex characters', () => {
    expect(isValidRetiredEntry({ path: 'tools/old-script.ps1', sha256: 'not-hex' })).toBe(false);
  });

  it('accepts a well-formed retired entry', () => {
    expect(isValidRetiredEntry({ path: 'tools/old-script.ps1', sha256: 'a'.repeat(64) })).toBe(
      true
    );
  });
});

// Mechanizes AC 3's retired/sharedPaths disjointness: a path cannot be both
// shared and retired at once, or a sync would copy a file and then delete it
// in the same run.
describe('retired / sharedPaths disjointness (AC 3)', () => {
  it('no retired path in the live manifest is matched by any sharedPaths entry', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const overlapping = manifest.retired.filter((e) => isShared(e.path, manifest.sharedPaths));
    expect(overlapping).toEqual([]);
  });

  // The exercised failing case: an inline fixture manifest whose retired
  // path is also covered by a sharedPaths entry.
  it('rejects a fixture manifest whose retired path is also a sharedPaths entry', () => {
    const fixtureShared = ['tools/**'];
    const fixtureRetired = [{ path: 'tools/old-script.ps1', sha256: 'a'.repeat(64) }];
    const overlapping = fixtureRetired.filter((e) => isShared(e.path, fixtureShared));
    expect(overlapping).toEqual(fixtureRetired);
  });
});

// Derived checks that read the manifest itself rather than carrying a second
// hand-written copy to compare against.

// AC5 bullet 1.
describe('shelf roots never a ** entry in sharedPaths (AC5)', () => {
  /** Prefixes of every sharedPaths `**` entry that name a shelf root, once a trailing slash is stripped from both sides. */
  function starPrefixesNamingShelfRoots(sharedPaths, shelfRoots) {
    const strippedShelfRoots = shelfRoots.map((r) => r.replace(/\/$/, ''));
    const starPrefixes = sharedPaths.filter((e) => e.endsWith('/**')).map((e) => e.slice(0, -3));
    return starPrefixes.filter((p) => strippedShelfRoots.includes(p));
  }

  it('no sharedPaths ** entry names a shelf root, in the live manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(starPrefixesNamingShelfRoots(manifest.sharedPaths, manifest.shelfRoots)).toEqual([]);
  });

  // Mutation-coverage: a fixture sharedPaths globbing a real shelf root
  // must be caught, proving the check isn't vacuous.
  it('rejects a fixture sharedPaths entry globbing a shelf root', () => {
    const fixtureShared = ['standards/**', 'tools/**'];
    const fixtureShelfRoots = ['docs/', 'tools/', 'scripts/', 'skills/'];
    expect(starPrefixesNamingShelfRoots(fixtureShared, fixtureShelfRoots)).toEqual(['tools']);
  });
});

// AC5 bullet 3.
describe('classes sidecar covers exactly sharedPaths and resolves any narrower key (AC5)', () => {
  /** sharedPaths entries with no matching classes key. */
  function sharedPathsMissingFromClasses(sharedPaths, classes) {
    return sharedPaths.filter((e) => !(e in classes));
  }

  /** classes keys that are neither a sharedPaths entry nor resolve under one. */
  function orphanClassKeys(classes, sharedPaths) {
    return Object.keys(classes).filter(
      (k) => !sharedPaths.includes(k) && !isShared(k, sharedPaths)
    );
  }

  it('every sharedPaths entry appears as a classes key, in the live manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(sharedPathsMissingFromClasses(manifest.sharedPaths, manifest.classes)).toEqual([]);
  });

  it('every classes key not itself a sharedPaths entry resolves under one, in the live manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(orphanClassKeys(manifest.classes, manifest.sharedPaths)).toEqual([]);
  });

  // Mutation-coverage: a sharedPaths entry with no classes key must be caught.
  it('rejects a fixture sharedPaths entry absent from classes', () => {
    expect(sharedPathsMissingFromClasses(['standards/**'], {})).toEqual(['standards/**']);
  });

  // Mutation-coverage: a classes key resolving under no sharedPaths entry
  // must be caught.
  it('rejects a fixture classes key that resolves under no sharedPaths entry', () => {
    expect(orphanClassKeys({ 'not-a-shared-path.md': 'content' }, ['standards/**'])).toEqual([
      'not-a-shared-path.md',
    ]);
  });
});

// AC5 bullet 4.
describe('arrivesAsStructure paths resolve under sharedPaths (AC5)', () => {
  /** arrivesAsStructure paths with no matching sharedPaths entry. */
  function unresolvedArrivals(arrivesAsStructure, sharedPaths) {
    return arrivesAsStructure.filter((p) => !isShared(p, sharedPaths));
  }

  it('every arrivesAsStructure path resolves under a sharedPaths entry, in the live manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(manifest.arrivesAsStructure.length).toBeGreaterThan(0);
    expect(unresolvedArrivals(manifest.arrivesAsStructure, manifest.sharedPaths)).toEqual([]);
  });

  // Mutation-coverage: an arrivesAsStructure path absent from sharedPaths
  // must be caught.
  it('rejects a fixture arrivesAsStructure path absent from sharedPaths', () => {
    expect(unresolvedArrivals(['not-a-shared-path.md'], ['standards/**'])).toEqual([
      'not-a-shared-path.md',
    ]);
  });
});

// AC4: every classes value is exactly "content" or "structure", and
// classesDefault is exactly "structure" in the live manifest, the safe-side
// value per the classesDefault rule in standards/governance-sync.md § "What a sync is".
describe('classes values and classesDefault hold only their allowed literals (AC4)', () => {
  /** `classes` entries whose value is not "content" or "structure", as "key: value" strings. */
  function invalidClassesValues(classes) {
    return Object.entries(classes)
      .filter(([, v]) => v !== 'content' && v !== 'structure')
      .map(([k, v]) => `${k}: ${v}`);
  }

  /** Empty when `value` is exactly "structure"; otherwise the one wrong value, as a list. */
  function invalidClassesDefault(value) {
    return value === 'structure' ? [] : [value];
  }

  it('every classes value is "content" or "structure", and classesDefault is "structure", in the live manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(invalidClassesValues(manifest.classes)).toEqual([]);
    expect(invalidClassesDefault(manifest.classesDefault)).toEqual([]);
  });

  // Mutation-coverage: a typo'd classes value must be caught, and named.
  it('rejects a fixture classes object with an invalid value', () => {
    expect(invalidClassesValues({ 'standards/**': 'content', 'tools/foo.ps1': 'contnet' })).toEqual(
      ['tools/foo.ps1: contnet']
    );
  });

  // Mutation-coverage: a classesDefault value other than "structure" must be
  // caught, and named.
  it('rejects a fixture classesDefault that is not "structure"', () => {
    expect(invalidClassesDefault('content')).toEqual(['content']);
  });
});

// AC8, parent half: every .githooks/ entry in this repo's own index must be
// mode 100755, or core.fileMode being false here lets a hook authored on
// Windows ship non-executable and git skip it in silence on a POSIX clone.
describe(".githooks/ files are all mode 100755 in this repo's index (AC8)", () => {
  /** Parses one `git ls-files -s` line into { mode, path }; ignores blank lines. */
  function parseLsFilesStage(raw) {
    return raw
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((line) => {
        const tab = line.indexOf('\t');
        const fields = line.slice(0, tab).split(' ');
        return { mode: fields[0], path: line.slice(tab + 1) };
      });
  }

  /** Entries whose mode is not 100755, as "path: mode" strings. */
  function nonExecutableEntries(entries) {
    return entries.filter((e) => e.mode !== '100755').map((e) => `${e.path}: ${e.mode}`);
  }

  it('every .githooks/ entry is mode 100755, in the live index', () => {
    const raw = execFileSync('git', ['ls-files', '-s', '.githooks/'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const entries = parseLsFilesStage(raw);
    expect(entries.map((e) => e.path).sort()).toEqual([
      '.githooks/commit-msg',
      '.githooks/pre-commit',
    ]);
    expect(nonExecutableEntries(entries)).toEqual([]);
  });

  // Mutation-coverage: a fixture `git ls-files -s` line carrying a 100644
  // .githooks/ entry must be caught, and named.
  it('rejects a fixture ls-files line naming a non-executable .githooks/ entry', () => {
    const raw = '100644 db207f36846b8cdc2e7a84908ee79397820cc320 0\t.githooks/commit-msg\n';
    const entries = parseLsFilesStage(raw);
    expect(nonExecutableEntries(entries)).toEqual(['.githooks/commit-msg: 100644']);
  });

  // Mutation-coverage on the parser itself: a well-formed 100755 line must
  // parse to zero violations, proving the check isn't vacuously true.
  it('parseLsFilesStage/nonExecutableEntries accept a well-formed 100755 line', () => {
    const raw = '100755 406066a61d5b22aba39c83ee0a31d60b1b5d61d1 0\t.githooks/pre-commit\n';
    const entries = parseLsFilesStage(raw);
    expect(entries).toEqual([{ mode: '100755', path: '.githooks/pre-commit' }]);
    expect(nonExecutableEntries(entries)).toEqual([]);
  });
});

describe('repoProfileFields names every repo-profile.json key', () => {
  it('lists each top-level key of repo-profile.json', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const profile = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'repo-profile.json'), 'utf8'));
    const named = manifest.repoProfileFields.map((f) => f.name);
    for (const key of Object.keys(profile)) expect(named, key).toContain(key);
  });
});
