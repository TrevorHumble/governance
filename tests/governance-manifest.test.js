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
const OWNERSHIP_MAP_PATH = path.join(REPO_ROOT, 'standards', 'ownership-map.md');

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

/** Escapes regex metacharacters in `s` so it can be embedded in a `new RegExp`. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the three citation-pattern regexes (double-quote, single-quote,
 * §-omitted) for one doc filename. Single owner of that shape; see
 * DESIGN.md's governance-manifest semantics section.
 */
function docSectionCitationPatterns(fileName) {
  const esc = escapeRegExp(fileName);
  return [
    new RegExp('`?' + esc + '`?\\s*§\\s*"([^"]+)"', 'g'),
    new RegExp('`?' + esc + "`?\\s*§\\s*'([^']+)'", 'g'),
    new RegExp('`?' + esc + '`?\\s+"([^"]+)"', 'g'),
  ];
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
  const citations = [];
  for (const re of docSectionCitationPatterns('DESIGN.md')) {
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

/**
 * Returns the lines of the named level-2 (`## `) section in `text`. Throws,
 * naming the heading, rather than returning empty text; see DESIGN.md's
 * governance-manifest semantics section.
 */
function extractSection(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) {
    throw new Error(`extractSection: no "## ${heading}" heading found`);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

/** Strips an optional leading "- " list marker from a line, trimming the result: single owner for the four parsers below. */
function stripListMarker(line) {
  return line.replace(/^\s*-\s+/, '').trim();
}

/**
 * Parses the ownership map's "Split-ownership directories" section for its
 * four directory bullets. Single owner of that list; see DESIGN.md's
 * governance-manifest semantics section.
 */
function extractSplitOwnershipDirs(mapText) {
  const section = extractSection(mapText, 'Split-ownership directories');
  const dirs = [];
  for (const rawLine of section.split('\n')) {
    if (!/^\s*-\s+`/.test(rawLine)) continue; // skip prose paragraphs, e.g. the .githooks/ aside
    const line = stripListMarker(rawLine);
    const m = line.match(/^`([^`]+\/)`/);
    if (m) dirs.push(m[1]);
  }
  return dirs;
}

/**
 * Parses the ownership map's "Parent-owned paths inside split-ownership
 * directories" section: one backticked path per line, with an optional
 * leading "- " stripped first so the section can render as a real Markdown
 * list instead of one run-on paragraph.
 */
function extractSplitOwnershipPaths(mapText) {
  const section = extractSection(mapText, 'Parent-owned paths inside split-ownership directories');
  const paths = [];
  for (const rawLine of section.split('\n')) {
    const line = stripListMarker(rawLine);
    const m = line.match(/^`([^`]+)`$/);
    if (m) paths.push(m[1]);
  }
  return paths;
}

/**
 * Parses the ownership map's "Standard shelves" section for the four shelf
 * roots: every backticked, "/"-suffixed token anywhere in the section,
 * de-duplicated. See DESIGN.md's governance-manifest semantics section.
 */
function extractShelfRoots(mapText) {
  const section = extractSection(mapText, 'Standard shelves');
  const withoutListMarkers = section
    .split('\n')
    .map((l) => stripListMarker(l))
    .join('\n');
  const roots = [];
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(withoutListMarkers)) !== null) {
    if (m[1].endsWith('/') && !roots.includes(m[1])) roots.push(m[1]);
  }
  return roots;
}

/**
 * Parses DESIGN.md's "repo-profile.json schema" section for one
 * `{name, type}` pair per bullet: the backticked field name at the start of
 * the bullet and the parenthetical type immediately following it, matching
 * `- \`fieldName\` (type). ...`. A parenthetical later in the same bullet's
 * prose is not captured -- only the one immediately after the field name.
 */
function extractRepoProfileFields(designText) {
  const section = extractSection(designText, 'repo-profile.json schema');
  const fields = [];
  for (const rawLine of section.split('\n')) {
    const line = stripListMarker(rawLine);
    const m = line.match(/^`([^`]+)`\s+\(([^)]+)\)/);
    if (m) fields.push({ name: m[1], type: m[2] });
  }
  return fields;
}

/** Joins a `{name, type}` pair into one comparable key. */
function fieldKey(field) {
  return `${field.name}::${field.type}`;
}

/**
 * Extracts every `CLAUDE.md` section title cited by name in `text` (already
 * dewrapped), in either of the two shapes a sharedPaths file uses to name
 * the override home (issue #11 AC5, the same derived-citation guard the
 * `DESIGN.md` scanner above already runs):
 *
 * 1. The adjacent form, `CLAUDE.md` immediately next to a quoted or
 *    §-marked title -- the same adjacency `extractDesignCitations` requires.
 * 2. A bare backticked `` `## Heading` `` naming a CLAUDE.md section within
 *    150 characters of a "CLAUDE.md" mention, in either order. See
 *    DESIGN.md's governance-manifest semantics section for why both orders
 *    must be caught.
 */
function extractClaudeMdSectionCitations(text) {
  const titles = [];
  for (const re of docSectionCitationPatterns('CLAUDE.md')) {
    let m;
    while ((m = re.exec(text)) !== null) titles.push(m[1].trim());
  }
  const mentionRe = /CLAUDE\.md/g;
  let mm;
  while ((mm = mentionRe.exec(text)) !== null) {
    const windowStart = Math.max(0, mm.index - 150);
    const windowEnd = Math.min(text.length, mm.index + 150);
    const window = text.slice(windowStart, windowEnd);
    const headingRe = /`##\s+([^`]+)`/g;
    let hm;
    while ((hm = headingRe.exec(window)) !== null) titles.push(hm[1].trim());
  }
  return titles;
}

/**
 * Parses the ownership map's "The CLAUDE.md leash" section for the
 * carve-out list: one backticked `` `## Heading` `` per line, leading "- "
 * stripped first, matching the split-ownership parser's convention.
 */
function extractClaudeMdCarveOutList(mapText) {
  const section = extractSection(mapText, 'The CLAUDE.md leash');
  const titles = [];
  for (const rawLine of section.split('\n')) {
    const line = stripListMarker(rawLine);
    const m = line.match(/^`##\s+([^`]+)`$/);
    if (m) titles.push(m[1].trim());
  }
  return titles;
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
    const line = 'See the governance repo\'s `DESIGN.md` § "Some Section" for more.';
    const dewrapped = dewrapText(line);
    const citations = extractDesignCitations(dewrapped);
    expect(citations).toHaveLength(1);
    expect(hasGovernanceRepoPrefix(dewrapped, citations[0].index)).toBe(true);
  });
});

// extractSection throwing on a missing heading is what every AC5 parser
// below relies on instead of hand-writing its own non-empty guard.
describe('extractSection throws when a heading is missing', () => {
  it('throws, naming the heading, when the section is absent', () => {
    const fixture = ['## Some Other Heading', '', 'body text', ''].join('\n');
    expect(() => extractSection(fixture, 'Missing Heading')).toThrow(/Missing Heading/);
  });

  it('returns the section body when the heading is present', () => {
    const fixture = ['## Present Heading', '', 'body text', '', '## Next', ''].join('\n');
    expect(extractSection(fixture, 'Present Heading')).toContain('body text');
  });
});

// The seven derived checks issue #11's AC5 requires, each reading a source
// of truth (the ownership map, DESIGN.md, or the manifest itself) rather
// than carrying a second hand-written copy to compare against.

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

// AC5 bullet 2.
describe("ownership map's split-ownership section matches sharedPaths, both directions (AC5)", () => {
  // Derived from the map itself, the same way the CLAUDE.md carve-out list
  // is parsed rather than hand-copied below.
  const SPLIT_OWNERSHIP_DIRS = extractSplitOwnershipDirs(
    fs.readFileSync(OWNERSHIP_MAP_PATH, 'utf8')
  );

  /** Map-listed paths with no matching sharedPaths entry. */
  function unresolvedMapPaths(mapPaths, sharedPaths) {
    return mapPaths.filter((p) => !isShared(p, sharedPaths));
  }

  /** sharedPaths entries under a split-ownership directory the map does not list. */
  function sharedEntriesMissingFromMap(sharedPaths, mapPaths) {
    return sharedPaths.filter(
      (e) => SPLIT_OWNERSHIP_DIRS.some((d) => e.startsWith(d)) && !mapPaths.includes(e)
    );
  }

  it('every path the ownership map lists resolves under a sharedPaths entry, in the live tree', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const mapPaths = extractSplitOwnershipPaths(fs.readFileSync(OWNERSHIP_MAP_PATH, 'utf8'));
    expect(unresolvedMapPaths(mapPaths, manifest.sharedPaths)).toEqual([]);
  });

  it('every sharedPaths entry under a split-ownership directory appears in the map, in the live tree', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const mapPaths = extractSplitOwnershipPaths(fs.readFileSync(OWNERSHIP_MAP_PATH, 'utf8'));
    expect(sharedEntriesMissingFromMap(manifest.sharedPaths, mapPaths)).toEqual([]);
  });

  // Mutation-coverage: a map path absent from sharedPaths must be caught.
  it('rejects a fixture map path absent from sharedPaths', () => {
    expect(
      unresolvedMapPaths(['.claude/commands/phantom.md'], ['.claude/commands/build.md'])
    ).toEqual(['.claude/commands/phantom.md']);
  });

  // Mutation-coverage: a sharedPaths entry under a split-ownership
  // directory missing from the map must be caught.
  it('rejects a fixture sharedPaths entry under a split-ownership directory missing from the map', () => {
    expect(
      sharedEntriesMissingFromMap(['.claude/hooks/phantom.ps1'], ['.claude/hooks/goal-gate.ps1'])
    ).toEqual(['.claude/hooks/phantom.ps1']);
  });

  // Mutation-coverage on the parser itself: stripping the optional leading
  // "- " must actually happen, not just be documented.
  it('extractSplitOwnershipPaths strips an optional leading "- "', () => {
    const fixture = [
      '## Parent-owned paths inside split-ownership directories',
      '',
      '- `.claude/commands/build.md`',
      '`.claude/rules/dependencies.md`',
      '',
      '## Standard shelves',
      '',
    ].join('\n');
    expect(extractSplitOwnershipPaths(fixture)).toEqual([
      '.claude/commands/build.md',
      '.claude/rules/dependencies.md',
    ]);
  });

  // Mutation-coverage on the parser itself: only the first backticked token
  // on a bullet line is a directory, not a path named later in that same
  // bullet's prose (e.g. `.claude/rules/dependencies.md` inside the
  // `.claude/rules/` bullet).
  it('extractSplitOwnershipDirs reads only the bullet-leading directory from each line', () => {
    const fixture = [
      '## Split-ownership directories',
      '',
      '- `.claude/commands/`: the parent owns some files.',
      '- `.claude/rules/`: the parent owns one file, `.claude/rules/dependencies.md`.',
      '',
      '## Parent-owned paths inside split-ownership directories',
      '',
    ].join('\n');
    expect(extractSplitOwnershipDirs(fixture)).toEqual(['.claude/commands/', '.claude/rules/']);
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

// AC5 bullet 5.
describe('ownership map shelf roots equal manifest shelfRoots, both directions (AC5)', () => {
  /** Roots present in one set but not the other, order-insensitively; empty when the sets match. */
  function mismatchedShelfRoots(mapRoots, manifestRoots) {
    const a = new Set(mapRoots);
    const b = new Set(manifestRoots);
    const diff = [];
    for (const r of mapRoots) if (!b.has(r)) diff.push(r);
    for (const r of manifestRoots) if (!a.has(r)) diff.push(r);
    return diff;
  }

  it('the four shelf roots the map names equal shelfRoots, in the live tree', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const mapRoots = extractShelfRoots(fs.readFileSync(OWNERSHIP_MAP_PATH, 'utf8'));
    expect(mismatchedShelfRoots(mapRoots, manifest.shelfRoots)).toEqual([]);
  });

  // Mutation-coverage: a set comparison, not a subset check, is required --
  // a fixture map set missing a manifest-declared root must be caught, and
  // named.
  it('rejects mismatched shelf-root sets', () => {
    const mapRoots = ['docs/', 'tools/', 'scripts/'];
    const manifestRoots = ['docs/', 'tools/', 'scripts/', 'skills/'];
    expect(mismatchedShelfRoots(mapRoots, manifestRoots)).toEqual(['skills/']);
  });

  // Mutation-coverage on the parser itself: reads the whole section, not
  // one line, and excludes the profile slot. See DESIGN.md's
  // governance-manifest semantics section for why.
  it('extractShelfRoots reads the whole section regardless of line wrapping, and excludes the profile slot', () => {
    const fixture = [
      '## Standard shelves',
      '',
      'Four roots, same path in every child, even when empty: `docs/` (pre-review doc), `tools/`',
      '(pre-review implementation scripts), `scripts/` (deploy/build machinery), `skills/` (product',
      'skills).',
      '',
      'The profile, `repo-profile.json` sits at the repo root as a named slot, not a shelf directory.',
      '',
      '## The reference rule',
      '',
    ].join('\n');
    expect(extractShelfRoots(fixture)).toEqual(['docs/', 'tools/', 'scripts/', 'skills/']);
  });

  // Mutation-coverage: a section naming only three roots must be caught,
  // proving the parser doesn't just hardcode a length-four answer.
  it('rejects a fixture Standard shelves section naming only three roots', () => {
    const fixture = [
      '## Standard shelves',
      '',
      '`docs/` `tools/` `scripts/`',
      '',
      '## The reference rule',
      '',
    ].join('\n');
    expect(extractShelfRoots(fixture)).toHaveLength(3);
  });

  // Mutation-coverage: a root mentioned twice in the section's prose must
  // not be double-counted; see DESIGN.md's governance-manifest semantics
  // section.
  it('extractShelfRoots de-duplicates a root mentioned twice in the section', () => {
    const fixture = [
      '## Standard shelves',
      '',
      'Four roots: `docs/`, `tools/`, `scripts/`, `skills/`.',
      '',
      'A shelf root the parent has no files under at all, such as `skills/`, needs no entry in',
      'either list.',
      '',
      '## The reference rule',
      '',
    ].join('\n');
    expect(extractShelfRoots(fixture)).toEqual(['docs/', 'tools/', 'scripts/', 'skills/']);
  });
});

// AC5 bullet 6.
describe('repoProfileFields equals the parsed DESIGN.md schema section, both directions (AC5)', () => {
  it('repoProfileFields matches the DESIGN.md schema section, both directions, in the live tree', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const parsed = extractRepoProfileFields(fs.readFileSync(DESIGN_PATH, 'utf8'));
    expect(manifest.repoProfileFields.map(fieldKey).sort()).toEqual(parsed.map(fieldKey).sort());
  });

  // Mutation-coverage: a fixture schema section naming a field the manifest
  // does not declare must produce a mismatched pair set.
  it('rejects a fixture schema section naming a field absent from repoProfileFields', () => {
    const fixture = [
      '## repo-profile.json schema',
      '',
      '- `preReview` (string). Allowed: the literal "none".',
      '- `phantomField` (string). Allowed: anything.',
      '',
      '## Next section',
      '',
    ].join('\n');
    const parsed = extractRepoProfileFields(fixture);
    const manifestFields = [{ name: 'preReview', type: 'string' }];
    expect(parsed.map(fieldKey).sort()).not.toEqual(manifestFields.map(fieldKey).sort());
  });

  // Mutation-coverage on the parser itself: the type captured must be the
  // parenthetical immediately after the field name, not a later one in the
  // bullet's prose.
  it('extractRepoProfileFields captures only the parenthetical immediately after the field name', () => {
    const fixture = [
      '## repo-profile.json schema',
      '',
      '- `ghPath` (string). Allowed: "gh" (on PATH) or an absolute path.',
      '',
      '## Next section',
      '',
    ].join('\n');
    expect(extractRepoProfileFields(fixture)).toEqual([{ name: 'ghPath', type: 'string' }]);
  });
});

// AC5 bullet 7.
describe('CLAUDE.md section citations from sharedPaths files appear in the ownership map carve-out list (AC5)', () => {
  it('every CLAUDE.md section title cited by a sharedPaths file appears in the carve-out list, in the live tree', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const carveOut = extractClaudeMdCarveOutList(fs.readFileSync(OWNERSHIP_MAP_PATH, 'utf8'));

    const tracked = listTrackedFiles();
    const citingFiles = tracked.filter((f) => isShared(f, manifest.sharedPaths));
    const dangling = [];
    let total = 0;
    for (const file of citingFiles) {
      const text = dewrapText(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'));
      const titles = extractClaudeMdSectionCitations(text);
      total += titles.length;
      for (const t of titles) {
        if (!carveOut.includes(t)) dangling.push(`${file}: "${t}"`);
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(dangling).toEqual([]);
  });

  // Mutation-coverage: the adjacent-quote shape citing a section absent
  // from the carve-out list must be caught.
  it('rejects an adjacent-form citation naming a section absent from the carve-out list', () => {
    const line = 'See `CLAUDE.md` § "Some Section Not In The Carve-Out List".';
    const titles = extractClaudeMdSectionCitations(dewrapText(line));
    const carveOut = extractClaudeMdCarveOutList(fs.readFileSync(OWNERSHIP_MAP_PATH, 'utf8'));
    expect(titles).toEqual(['Some Section Not In The Carve-Out List']);
    expect(carveOut).not.toContain(titles[0]);
  });

  // Mutation-coverage: the bare-heading-before-filename shape
  // standards/governance-sync.md actually uses must also be extracted.
  it('extracts the bare-heading-before-filename citation shape', () => {
    const line =
      "a line under `## Some Bare Heading` in the child's own `CLAUDE.md`, naming the rule.";
    expect(extractClaudeMdSectionCitations(dewrapText(line))).toEqual(['Some Bare Heading']);
  });
});

// AC4: every classes value is exactly "content" or "structure" (see
// DESIGN.md's governance-manifest semantics section), and classesDefault is
// exactly "structure" in the live manifest, the safe-side value per the
// classesDefault rule in standards/governance-sync.md § "What a sync is".
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
