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
// (see DESIGN.md's governance-manifest semantics section).
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
 * two arrays ever both claiming the same file (see DESIGN.md's governance-
 * manifest semantics section).
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

const DESIGN_PATH = path.join(REPO_ROOT, 'DESIGN.md');

/**
 * Joins a file's lines into one blob for citation scanning, stripping a
 * leading comment marker (#, //, *) from each line so a citation wrapped
 * across a comment continuation reassembles as one title, then collapses
 * whitespace runs to one space.
 */
function dewrapText(fileText) {
  const stripped = fileText
    .split('\n')
    .map((line) => line.replace(/^\s*(#|\/\/|\*)+\s?/, ''))
    .join(' ');
  return stripped.replace(/\s+/g, ' ');
}

/**
 * Extracts every DESIGN.md section citation from a file's dewrapped text, as
 * `{ title, index }` pairs: `index` is the match's start offset in the
 * dewrapped text, which the citation-prefix guard (below) needs to look at
 * what immediately precedes the citation. "DESIGN.md" must be immediately
 * adjacent to the § or opening quote -- mere co-occurrence with a quoted
 * title later in the same sentence is not a citation. See DESIGN.md's
 * governance-manifest semantics section for the worked example this
 * adjacency rule exists to handle.
 */
function extractDesignCitations(text) {
  const patterns = [
    /`?DESIGN\.md`?\s*§\s*"([^"]+)"/g,
    /`?DESIGN\.md`?\s*§\s*'([^']+)'/g,
    /`?DESIGN\.md`?\s+"([^"]+)"/g,
  ];
  const citations = [];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      citations.push({ title: m[1].trim(), index: m.index });
    }
  }
  return citations;
}

/**
 * True when `text` immediately before a citation match at `index` ends with
 * "governance repo's " (the prefix every sharedPaths-file citation must
 * carry, per AC 3, so the pointer stays true wherever the file lands: a
 * child reader is told explicitly that the cited section lives in the
 * governance repo's own DESIGN.md, not implicitly whatever DESIGN.md the
 * child itself happens to carry).
 */
function hasGovernanceRepoPrefix(text, index) {
  return text.slice(0, index).endsWith("governance repo's ");
}

/** True when `headings` contains a heading exactly matching `title`. */
function headingExists(headings, title) {
  return headings.includes(title);
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
  // excludedPaths -- see DESIGN.md's governance-manifest semantics section).
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

// Mechanizes the citation-coverage promise DESIGN.md § "governance-manifest.json
// semantics" states.
// Hand inventories of this set rot; this scan is the owner.
describe('DESIGN.md section citations from sharedPaths files', () => {
  it('every DESIGN.md section cited by a sharedPaths file matches a real DESIGN.md heading', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const designText = fs.readFileSync(DESIGN_PATH, 'utf8');
    const headings = [...designText.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());

    const tracked = listTrackedFiles();
    const citingFiles = tracked.filter((f) => isShared(f, manifest.sharedPaths));
    expect(citingFiles.length).toBeGreaterThan(0);

    const dangling = [];
    let totalCitations = 0;
    for (const file of citingFiles) {
      const text = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      const citations = extractDesignCitations(dewrapText(text));
      totalCitations += citations.length;
      for (const c of citations) {
        const found = headingExists(headings, c.title);
        if (!found) dangling.push(`${file}: "${c.title}"`);
      }
    }
    expect(totalCitations).toBeGreaterThan(0);
    expect(dangling).toEqual([]);
  });

  // Mutation-coverage: a citation naming a heading DESIGN.md does not have must be
  // caught, proving the scan doesn't just vacuously pass. Exercises the extraction
  // + lookup directly rather than mutating a real file on disk.
  it('rejects a citation naming a DESIGN.md heading that does not exist', () => {
    const designText = fs.readFileSync(DESIGN_PATH, 'utf8');
    const headings = [...designText.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
    const bogusLine = 'See `DESIGN.md` § "This Section Does Not Exist In DESIGN.md".';
    const citations = extractDesignCitations(dewrapText(bogusLine));
    expect(citations.map((c) => c.title)).toEqual(['This Section Does Not Exist In DESIGN.md']);
    expect(headingExists(headings, citations[0].title)).toBe(false);
  });

  // Proves the adjacency requirement: a line that mentions DESIGN.md and, later
  // in the same sentence, quotes a section title belonging to a DIFFERENT file
  // (standards/adversarial-review-protocol.md's own "Advisory-lens lifecycle"
  // heading) must not be extracted as a DESIGN.md citation.
  it('does not extract a same-file cross-reference that merely co-occurs with the word DESIGN.md', () => {
    const line =
      'This promotion to gating is an owner decision, recorded in `DESIGN.md`, per § "Advisory-lens lifecycle" below: the owner approved it.';
    expect(extractDesignCitations(dewrapText(line))).toEqual([]);
  });

  // Proves multi-line reassembly: a citation wrapped across a comment
  // continuation line, the actual shape used throughout this repo's .ps1
  // header comments, still extracts as one title.
  it('reassembles a citation title wrapped across a comment continuation line', () => {
    const wrapped = '# Rationale: DESIGN.md § "Lean review process\n# rationale".';
    expect(extractDesignCitations(dewrapText(wrapped)).map((c) => c.title)).toEqual([
      'Lean review process rationale',
    ]);
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
    expect(isValidRetiredEntry({ path: 'tools/old-script.ps1', sha256: 'a'.repeat(64) })).toBe(true);
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

// Mechanizes AC 3's citation-prefix guard: every DESIGN.md citation the
// scanner matches inside a sharedPaths file must carry the "governance
// repo's " prefix immediately before it, so the pointer stays true wherever
// the file lands (see the citation rewrites this issue ships alongside this
// guard). A future unprefixed citation fails this suite before it can reach
// a child.
describe('citation prefix guard (AC 3)', () => {
  it("every DESIGN.md citation in a sharedPaths file carries the governance repo's prefix, in the live tree", () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const tracked = listTrackedFiles();
    const citingFiles = tracked.filter((f) => isShared(f, manifest.sharedPaths));
    const unprefixed = [];
    let total = 0;
    for (const file of citingFiles) {
      const text = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      const dewrapped = dewrapText(text);
      const citations = extractDesignCitations(dewrapped);
      total += citations.length;
      for (const c of citations) {
        if (!hasGovernanceRepoPrefix(dewrapped, c.index)) {
          unprefixed.push(`${file}: "${c.title}"`);
        }
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(unprefixed).toEqual([]);
  });

  // The exercised failing case: an inline fixture line with no prefix.
  it('rejects an unprefixed citation line', () => {
    const line = 'See `DESIGN.md` § "Some Section" for more.';
    const dewrapped = dewrapText(line);
    const citations = extractDesignCitations(dewrapped);
    expect(citations).toHaveLength(1);
    expect(hasGovernanceRepoPrefix(dewrapped, citations[0].index)).toBe(false);
  });

  it('accepts a properly prefixed citation line', () => {
    const line = "See the governance repo's `DESIGN.md` § \"Some Section\" for more.";
    const dewrapped = dewrapText(line);
    const citations = extractDesignCitations(dewrapped);
    expect(citations).toHaveLength(1);
    expect(hasGovernanceRepoPrefix(dewrapped, citations[0].index)).toBe(true);
  });
});
