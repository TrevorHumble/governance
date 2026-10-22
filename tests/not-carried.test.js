// tests/not-carried.test.js
// The old tree is gone, and stays gone. #90's "Not carried" list is held here as globs; a tracked
// file that matches one fails unless the file map names it as a literal path (a path replaced in
// place). So this proves deletion only: it cannot tell whether a replaced file's content is new.
//
// A second check holds that no kept tool, hook or workflow cites a file that was deleted.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');

// #90 "Not carried": everything under standards/ and agents/, the shim, the commands, two skills
// and two hooks, the dependency rule, the claim and Dependabot tools with their tests, the seed
// classification note.
const NOT_CARRIED = [
  'standards/**',
  'agents/**',
  '.agents/**',
  '.claude/commands/**',
  '.claude/skills/capture-system-defect/**',
  '.claude/skills/github-write/**',
  '.claude/hooks/loop-gate.ps1',
  '.claude/hooks/goal-gate.ps1',
  '.claude/rules/dependencies.md',
  'tools/file-claim-core.ps1',
  'tools/classify-dep-pr*.ps1',
  'tools/check-deps-parity.ps1',
  'tests/file-claim*.test.js',
  'tests/classify-dep-pr*.test.js',
  'tests/check-deps-parity*.test.js',
  'docs/seed-classification-2026-08-16.md',
];

// The file map's literal paths that fall inside a glob above. The five standards are new files;
// the other two are replaced at the same path.
const FILE_MAP_PATHS = [
  'standards/reviewing.md',
  'standards/deciding.md',
  'standards/edge-cases.md',
  'standards/writing.md',
  'standards/skills.md',
  '.claude/skills/github-write/SKILL.md',
  '.claude/hooks/session-greeting.ps1',
];

// `**` crosses folders, `*` stays inside one name; anything else is literal.
function globToRegExp(glob) {
  const body = glob
    .split(/(\*\*|\*)/)
    .map((part) => {
      if (part === '**') return '.*';
      if (part === '*') return '[^/]*';
      return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${body}$`);
}

/**
 * Tracked files that match a Not carried glob and are not a file-map path.
 * @param {string[]} tracked
 * @param {string[]} globs
 * @param {string[]} allowed literal file-map paths
 * @returns {string[]}
 */
function notCarriedHits(tracked, globs, allowed) {
  const patterns = globs.map(globToRegExp);
  return tracked.filter((f) => patterns.some((re) => re.test(f)) && !allowed.includes(f));
}

const tracked = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const manifest = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'governance-manifest.json'), 'utf8')
);

describe('the Not carried list', () => {
  it('matches no tracked file, apart from the file map paths', () => {
    expect(notCarriedHits(tracked, NOT_CARRIED, FILE_MAP_PATHS)).toEqual([]);
  });

  it('fails on a tracked file that matches a glob (the check is not vacuous)', () => {
    const listing = [
      'standards/adversarial-review-protocol.md',
      'standards/pipeline/steps/01-isolate.md',
      'agents/orchestrator/dependabot-pr-path.md',
      '.agents/hooks.json',
      '.claude/commands/build.md',
      '.claude/skills/capture-system-defect/SKILL.md',
      '.claude/hooks/loop-gate.ps1',
      '.claude/rules/dependencies.md',
      'tools/classify-dep-pr-core.ps1',
      'tools/classify-dep-pr.ps1',
      'tests/classify-dep-pr.test.js',
      'docs/seed-classification-2026-08-16.md',
    ];
    expect(notCarriedHits(listing, NOT_CARRIED, FILE_MAP_PATHS)).toEqual(listing);
  });

  it('lets a file-map path through, and nothing near it', () => {
    const listing = [
      'standards/reviewing.md',
      '.claude/skills/github-write/SKILL.md',
      '.claude/skills/github-write/extra.md',
      'standards/reviewing.md.bak',
      'pipeline/PIPELINE.md',
      'tools/classify.ps1',
    ];
    expect(notCarriedHits(listing, NOT_CARRIED, FILE_MAP_PATHS)).toEqual([
      '.claude/skills/github-write/extra.md',
      'standards/reviewing.md.bak',
    ]);
  });

  it('has no new-tree.json left', () => {
    expect(tracked).not.toContain('new-tree.json');
  });

  it('keeps the file-map paths it lets through on disk', () => {
    for (const file of FILE_MAP_PATHS) expect(tracked, file).toContain(file);
  });
});

describe('the retired list', () => {
  it('has no retired path still tracked', () => {
    expect(manifest.retired.map((e) => e.path).filter((p) => tracked.includes(p))).toEqual([]);
  });

  it('retires every file the Not carried list deleted from the shared paths', () => {
    const retired = manifest.retired.map((e) => e.path);
    for (const expected of [
      'standards/ownership-map.md',
      'standards/pipeline/PIPELINE.md',
      'standards/governance-sync.md',
      'agents/orchestrator.md',
      'agents/reviewer-notes.md',
      'tools/file-claim-core.ps1',
      'tools/classify-dep-pr.ps1',
      'tools/classify-dep-pr-core.ps1',
      'tools/check-deps-parity.ps1',
    ]) {
      expect(retired, expected).toContain(expected);
    }
  });
});

describe('no kept tool, hook or workflow cites a deleted file', () => {
  const KEPT_ROOTS = [
    'tools/',
    'scripts/',
    '.githooks/',
    '.github/',
    '.claude/hooks/',
    '.claude/settings.json',
  ];
  const deletedPaths = [...manifest.retired.map((e) => e.path), 'new-tree.json'];

  /** For each file, the deleted paths its text names. */
  function citations(files, readFile) {
    const hits = [];
    for (const file of files) {
      const text = readFile(file);
      for (const deleted of deletedPaths) {
        // Not inside a longer path: `.claude/agents/x.md` is not a citation of `agents/x.md`.
        const cited = new RegExp(
          `(^|[^/.\\w-])${deleted.replace(/[.+?^${}()|[\]\\]/g, '\\$&')}`,
          'm'
        );
        if (cited.test(text)) hits.push(`${file} cites ${deleted}`);
      }
    }
    return hits;
  }

  it('finds no citation in the live tree', () => {
    const kept = tracked.filter((f) => KEPT_ROOTS.some((r) => f === r || f.startsWith(r)));
    expect(kept.length).toBeGreaterThan(20);
    expect(citations(kept, (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))).toEqual([]);
  });

  it('finds a citation when one is there (the check is not vacuous)', () => {
    const text = {
      'tools/a.ps1': '# see standards/ownership-map.md "The redirect rule"',
      'tools/b.ps1': '# nothing to see',
      '.githooks/pre-commit': 'echo "tools/file-claim-core.ps1 and new-tree.json"',
      'tools/c.ps1':
        'read .claude/agents/orchestrator.md and ./tools/x.ps1 and tools/agents/orchestrator.md',
    };
    expect(citations(Object.keys(text), (f) => text[f])).toEqual([
      'tools/a.ps1 cites standards/ownership-map.md',
      '.githooks/pre-commit cites tools/file-claim-core.ps1',
      '.githooks/pre-commit cites new-tree.json',
    ]);
  });
});
