// tests/check-token-budget.test.js
// Vitest tests for the token-budget gate: scripts/check-token-budget-core.js on temp files, the
// wrapper's base and guard handling on temp git repos, and the counting rule: the markdown in the
// manifest's shared paths.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const core = require('../scripts/check-token-budget-core');
const { main } = require('../scripts/check-token-budget');

const { parseSkill, countInputs, guardedChanges, guardFailures, isNotCounted, isSharedPath } = core;
const CAPS = { total: 25000, reviewer: 10000 };
const run = (files, readFile, extra) => core.run(files, readFile, CAPS, extra);

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-budget-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeFileOfWords(rel, words) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Array(words).fill('w').join(' '));
  return rel;
}
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const text = (r) => r.lines.join('\n');

// One light reviewer folder so a list that is not about reviewers still passes that check.
const writePrsReviewer = () => writeFileOfWords('.claude/skills/reviewing-prs/SKILL.md', 10);
const writeDocsReviewer = () => writeFileOfWords('.claude/skills/reviewing-docs/SKILL.md', 10);

describe('total budget', () => {
  it('passes under budget and prints the total, rounded up once', () => {
    // 100 + 10 words = 110 words * 1.35 = 148.5 -> 149
    const r = run([writeFileOfWords('a.md', 100), writePrsReviewer()], read);
    expect(r.exitCode).toBe(0);
    expect(text(r)).toContain('149 tokens in total');
  });

  it('passes at exactly 25,000 tokens and fails at 25,001', () => {
    // 18,508 + 10 words = 18,518 * 1.35 = 24,999.3 -> 25,000; one more word gives 25,000.65 -> 25,001
    const at = run([writeFileOfWords('a.md', 18508), writePrsReviewer()], read);
    expect(at.exitCode).toBe(0);
    expect(text(at)).toContain('25000 tokens in total');
    const over = run([writeFileOfWords('b.md', 18509), writePrsReviewer()], read);
    expect(over.exitCode).toBe(1);
    expect(text(over)).toContain('25001 tokens in total');
  });

  it('fails over budget, names the total and the largest file', () => {
    const r = run(
      [writeFileOfWords('small.md', 100), writeFileOfWords('huge.md', 20000), writePrsReviewer()],
      read
    );
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('27149 tokens in total');
    expect(text(r)).toContain('huge.md: 27000 tokens');
    expect(r.lines.findIndex((l) => l.includes('huge.md'))).toBeLessThan(
      r.lines.findIndex((l) => l.includes('small.md'))
    );
  });

  it('shows only the 5 largest files', () => {
    const files = [1, 2, 3, 4, 5, 6].map((n) => writeFileOfWords(`f${n}.md`, n * 4000));
    const r = run([...files, writePrsReviewer()], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('f6.md');
    expect(text(r)).toContain('f2.md');
    expect(text(r)).not.toContain('f1.md');
  });

  it('counts only .md files: .js, .ps1 and .json add nothing', () => {
    const md = [writeFileOfWords('a.md', 100), writePrsReviewer()];
    const mixed = [
      ...md,
      writeFileOfWords('x.js', 5000),
      writeFileOfWords('y.ps1', 5000),
      writeFileOfWords('z.json', 5000),
    ];
    const r = run(mixed, read);
    expect(r.exitCode).toBe(0);
    expect(text(r)).toContain('149 tokens in total');
  });

  it('fails on an empty file list', () => {
    const r = run([], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('empty');
  });

  it('fails, not crashes, on an unreadable file', () => {
    const r = run(['missing.md', writePrsReviewer()], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('cannot read missing.md');
  });

  it('counts a file listed twice once', () => {
    const a = writeFileOfWords('a.md', 100);
    const r = run([a, a, writePrsReviewer()], read);
    expect(text(r)).toContain('149 tokens in total');
  });
});

describe('reviewer budget', () => {
  it('fails a heavy reviewer and names it, and passes the light one', () => {
    const files = [
      writeFileOfWords('.claude/skills/reviewing-design/SKILL.md', 5000),
      writeFileOfWords('.claude/skills/reviewing-design/reference/examples.md', 2000),
      writeFileOfWords('.claude/skills/reviewing-prs/SKILL.md', 100),
      writeFileOfWords('standards/reviewing.md', 1000),
    ];
    // design: 8000 words * 1.35 = 10,800 > 10,000; prs: 1,100 words = 1,485
    const r = run(files, read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('FAIL, reviewer reviewing-design is 10800 tokens');
    expect(text(r)).not.toContain('FAIL, reviewer reviewing-prs');
    expect(text(r)).toContain('reviewer reviewing-prs: 1485 tokens');
  });

  it('counts the reviewer agent file, and refereeing is a reviewer', () => {
    const files = [
      writeFileOfWords('.claude/skills/refereeing/SKILL.md', 100),
      writeFileOfWords('.claude/agents/reviewer.md', 100),
    ];
    const r = run(files, read);
    expect(text(r)).toContain('reviewer refereeing: 270 tokens');
  });

  it('does not treat other skills as reviewers', () => {
    const r = run(
      [writePrsReviewer(), writeFileOfWords('.claude/skills/build/SKILL.md', 9000)],
      read
    );
    expect(r.exitCode).toBe(0);
    expect(text(r)).not.toContain('reviewer build');
  });

  it('fails when no reviewer folder exists', () => {
    const r = run([writeFileOfWords('a.md', 10)], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('no reviewing-* or refereeing skill folder');
  });

  it('reads reviewers under .claude/ and not under a folder of another name', () => {
    const a = run([writeFileOfWords('.claude/skills/reviewing-prs/SKILL.md', 100)], read);
    const b = run([writeFileOfWords('staged/skills/reviewing-prs/SKILL.md', 100)], read);
    expect(text(a)).toContain('reviewer reviewing-prs: 135 tokens');
    expect(text(b)).toContain('no reviewing-* or refereeing skill folder');
  });
});

describe('caps', () => {
  it('takes the caps it is given, not fixed ones', () => {
    const r = core.run([writeFileOfWords('a.md', 100), writePrsReviewer()], read, {
      total: 100,
      reviewer: 5,
    });
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('FAIL, 149 tokens in total, over the 100 limit');
    expect(text(r)).toContain('FAIL, reviewer reviewing-prs is 14 tokens, over 5');
  });

  it('fails on a missing or non-numeric cap', () => {
    const files = [writePrsReviewer()];
    for (const caps of [undefined, {}, { total: 25000 }, { total: '25000', reviewer: 10000 }]) {
      const r = core.run(files, read, caps);
      expect(r.exitCode).toBe(1);
      expect(text(r)).toContain('budget.total and budget.reviewer must both be numbers');
    }
  });
});

describe('failure messages', () => {
  it('lists the ways to make room under the total cap, with the owner condition', () => {
    const r = run([writeFileOfWords('huge.md', 20000), writePrsReviewer()], read);
    const out = text(r);
    expect(out).toContain("needs the owner's yes first");
    expect(out).toContain('say something more concisely anywhere in the repo');
    expect(out).toContain('move a rule into a check that passes or fails');
    expect(out).toContain('remove something that no longer earns its place');
    expect(out).toContain('ask the owner to raise budget.total');
    expect(out).not.toContain('one-pass specialist');
  });

  it('lists the ways to make room under a reviewer cap, and not the total ones', () => {
    const r = run([writeFileOfWords('.claude/skills/reviewing-prs/SKILL.md', 8000)], read);
    const out = text(r);
    expect(r.exitCode).toBe(1);
    expect(out).toContain(
      "cut that reviewer's own reading (its skill, its reads, its vendored files)"
    );
    expect(out).toContain('move a large skill to a one-pass specialist');
    expect(out).toContain("needs the owner's yes first");
    expect(out).not.toContain('say something more concisely');
  });

  it('says the base was already over, or was under, when given its counts', () => {
    const files = [writeFileOfWords('huge.md', 20000), writePrsReviewer()];
    const over = run(files, read, { base: { ref: 'origin/v2', total: 26000, reviewers: {} } });
    expect(text(over)).toContain('The base (origin/v2) was already over: 26000 tokens.');
    const under = run(files, read, { base: { ref: 'origin/v2', total: 24000, reviewers: {} } });
    expect(text(under)).toContain('The base (origin/v2) was 24000 tokens, under the limit.');
    const none = run(files, read, { base: { ref: 'origin/v2', reviewers: {} } });
    expect(text(none)).toContain('The base (origin/v2) has no count for the total.');
  });

  it('says it per reviewer too', () => {
    const files = [writeFileOfWords('.claude/skills/reviewing-prs/SKILL.md', 8000)];
    const r = run(files, read, {
      base: { ref: 'origin/v2', total: 1, reviewers: { 'reviewing-prs': 10500 } },
    });
    expect(text(r)).toContain('The base (origin/v2) was already over: 10500 tokens.');
  });
});

describe('reading lists and the reviewer library', () => {
  const V = 'vendor/skills/acme/design/';
  const SKILL = '.claude/skills/reviewing-prs/SKILL.md';
  const skillText = (reads, body = 'body') =>
    `---\nname: reviewing-prs\ndescription: d\nmetadata:\n  reads: "${reads.join(' ')}"\n---\n${body}`;
  const writeText = (rel, body) => {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
    return rel;
  };
  const entry = (over = {}) => ({
    name: 'design',
    reviewers: ['reviewing-prs'],
    files: [
      { path: `${V}SKILL.md`, sha256: 'aa' },
      { path: `${V}LICENSE`, sha256: 'bb' },
    ],
    ...over,
  });
  const hashes = { [`${V}SKILL.md`]: 'aa', [`${V}LICENSE`]: 'bb' };
  // The reviewer SKILL.md above is 10 words with one path.
  const withLibrary = (extra = {}) => {
    writeFileOfWords(`${V}SKILL.md`, 1000);
    writeText(`${V}LICENSE`, 'MIT licence text');
    return {
      library: [entry()],
      vendorHashes: hashes,
      ...extra,
    };
  };

  it('counts a read file toward its reviewer, once, and shows the vendored share', () => {
    // a repeated path, and AGENTS.md, which is also a shared path
    writeText(
      SKILL,
      skillText([`${V}SKILL.md`, 'standards/reviewing.md', 'standards/reviewing.md', 'AGENTS.md'])
    );
    writeFileOfWords('standards/reviewing.md', 100);
    writeFileOfWords('AGENTS.md', 50);
    const extra = withLibrary();
    const r = run([SKILL, 'standards/reviewing.md', 'AGENTS.md', `${V}SKILL.md`], read, extra);
    // skill 13 words + reviewing.md 100 + AGENTS.md 50 + vendored 1000 = 1163 * 1.35 = 1570.05 -> 1571
    expect(text(r)).toContain(
      'reviewer reviewing-prs: 1571 tokens (limit 10000; 1350 of it vendored)'
    );
    expect(r.exitCode).toBe(0);
  });

  it('keeps a vendored file out of the total, and counts it in its reviewer', () => {
    writeText(SKILL, skillText([`${V}SKILL.md`]));
    const extra = withLibrary();
    const vendored = [`${V}SKILL.md`, `${V}LICENSE`];
    const files = countInputs({
      listing: [SKILL, ...vendored],
      notCounted: [],
      sharedPaths: ['.claude/**', 'vendor/**'],
    });
    expect(files).toEqual([SKILL]);
    const r = run(files, read, extra);
    expect(text(r)).toContain('14 tokens in total');
    expect(text(r)).toContain('1364 tokens (limit 10000; 1350 of it vendored)');
  });

  it('lets a vendored file push its reviewer over the reviewer cap but not the total', () => {
    writeText(SKILL, skillText([`${V}SKILL.md`]));
    writeFileOfWords(`${V}SKILL.md`, 9000);
    const extra = { library: [entry()], vendorHashes: hashes };
    writeText(`${V}LICENSE`, 'x');
    const r = run([SKILL], read, extra);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('FAIL, reviewer reviewing-prs is 12164 tokens, over 10000');
    expect(text(r)).not.toContain('in total, over');
  });

  it('fails a reviewer reading a path that is missing', () => {
    writeText(SKILL, skillText(['standards/nowhere.md']));
    const r = run([SKILL], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('cannot read standards/nowhere.md');
  });

  it('fails a reviewer reading a missing path that is not .md', () => {
    writeText(SKILL, skillText(['NORTH-STAR.MD']));
    const r = run([SKILL], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('cannot read NORTH-STAR.MD');
  });

  it('fails a library reviewer that matches no reviewer folder', () => {
    writeText(SKILL, skillText([`${V}SKILL.md`]));
    const extra = withLibrary({ library: [entry({ reviewers: ['reviewing-nothing'] })] });
    const r = run([SKILL], read, extra);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('names reviewer reviewing-nothing, which matches no reviewer folder');
  });

  it("fails a named reviewer whose reads miss one of the entry's .md files, and ignores LICENSE", () => {
    writeText(SKILL, skillText(['standards/reviewing.md']));
    writeFileOfWords('standards/reviewing.md', 10);
    const r = run([SKILL, 'standards/reviewing.md'], read, withLibrary());
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain(`does not list ${V}SKILL.md in metadata.reads`);
    expect(text(r)).not.toContain(`does not list ${V}LICENSE`);
  });

  it('passes a reviewer that lists every .md file of its entry', () => {
    writeText(SKILL, skillText([`${V}SKILL.md`]));
    expect(run([SKILL], read, withLibrary()).exitCode).toBe(0);
  });

  it('holds a reviewer with no frontmatter to the library, as one with no reads', () => {
    const r = run([writePrsReviewer()], read, withLibrary());
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain(`does not list ${V}SKILL.md in metadata.reads`);
  });

  it('holds a reviewer with no frontmatter to the body path check', () => {
    writeText(SKILL, 'Read `standards/reviewing.md`.');
    writeFileOfWords('standards/reviewing.md', 10);
    const r = run([SKILL, 'standards/reviewing.md'], read, {
      tracked: new Set(['standards/reviewing.md']),
    });
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('names standards/reviewing.md in its body but not in metadata.reads');
  });

  it('reads the frontmatter of a reviewer skill that starts with a byte order mark', () => {
    writeText(SKILL, `\uFEFF${skillText([`${V}SKILL.md`])}`);
    expect(run([SKILL], read, withLibrary()).exitCode).toBe(0);
  });

  it('holds a reviewer with frontmatter but no metadata.reads to the library', () => {
    writeText(SKILL, '---\nname: reviewing-prs\ndescription: d\n---\nbody');
    const r = run([SKILL], read, withLibrary());
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain(`does not list ${V}SKILL.md`);
  });

  it('fails a vendored path that is read but has no library entry naming the reviewer', () => {
    writeText(SKILL, skillText([`${V}SKILL.md`]));
    writeFileOfWords(`${V}SKILL.md`, 10);
    const none = run([SKILL], read, { library: [], vendorHashes: {} });
    expect(none.exitCode).toBe(1);
    expect(text(none)).toContain(`reads ${V}SKILL.md, which has no reviewer-library.json entry`);
    const other = run([SKILL, writeDocsReviewer()], read, {
      library: [entry({ reviewers: ['reviewing-docs'] })],
      vendorHashes: hashes,
    });
    expect(text(other)).toContain(`reads ${V}SKILL.md, which has no reviewer-library.json entry`);
  });

  it("fails when a vendored file's hash differs from the library", () => {
    writeText(SKILL, skillText([`${V}SKILL.md`]));
    const extra = withLibrary({ vendorHashes: { ...hashes, [`${V}SKILL.md`]: 'changed' } });
    const r = run([SKILL], read, extra);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain(
      `${V}SKILL.md has sha256 changed, but reviewer-library.json records aa`
    );
  });

  it('fails a file under vendor/skills/ with no library entry, and a library file not on disk', () => {
    writeText(SKILL, skillText([`${V}SKILL.md`]));
    const hidden = withLibrary({ vendorHashes: { ...hashes, [`${V}extra.md`]: 'cc' } });
    const a = run([SKILL], read, hidden);
    expect(a.exitCode).toBe(1);
    expect(text(a)).toContain(
      `${V}extra.md is under vendor/skills/ but has no reviewer-library.json entry`
    );
    const gone = withLibrary({ vendorHashes: { [`${V}SKILL.md`]: 'aa' } });
    const b = run([SKILL], read, gone);
    expect(text(b)).toContain(`${V}LICENSE is in reviewer-library.json but not on disk`);
  });

  it('fails a malformed library entry and a library file outside vendor/skills/', () => {
    writeText(SKILL, skillText([]));
    const bad = run([SKILL], read, { library: [{ name: 'x' }], vendorHashes: {} });
    expect(text(bad)).toContain('x needs reviewers and files with path and sha256');
    const outside = run([SKILL], read, {
      library: [entry({ files: [{ path: 'standards/x.md', sha256: 'aa' }] })],
      vendorHashes: {},
    });
    expect(text(outside)).toContain('lists a file outside vendor/skills/');
  });

  it('fails a body path that is a tracked file missing from reads, and ignores the rest', () => {
    const body =
      'Read `standards/reviewing.md`, `standards/other.md`, `standards/`, `not/tracked.md`.';
    writeText(SKILL, skillText([], body));
    writeFileOfWords('standards/reviewing.md', 10);
    writeFileOfWords('standards/other.md', 10);
    const tracked = new Set(['standards/reviewing.md', 'standards/other.md']);
    const r = run([SKILL, 'standards/reviewing.md', 'standards/other.md'], read, { tracked });
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain(
      `${SKILL} names standards/reviewing.md in its body but not in metadata.reads`
    );
    expect(text(r)).toContain('standards/other.md in its body');
    expect(text(r)).not.toContain('not/tracked.md');
    expect(text(r)).not.toContain('names standards/ ');
    const ok = run([SKILL, 'standards/reviewing.md', 'standards/other.md'], read, {
      tracked: new Set(),
    });
    expect(ok.exitCode).toBe(0);
  });

  it('reports a metadata.reads that is not one string', () => {
    writeText(SKILL, '---\nname: a\nmetadata:\n  reads: >\n    x\n---\nbody');
    const r = run([SKILL], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('metadata.reads must be one quoted string of paths');
  });
});

describe('parseSkill', () => {
  it('reads the quoted reads string from metadata', () => {
    const s = '---\nname: a\nmetadata:\n  reads: "x.md y/z.md"\n---\nbody here';
    expect(parseSkill(s)).toEqual({ reads: ['x.md', 'y/z.md'], body: 'body here' });
  });

  it('reads single quotes, unquoted values, and CRLF', () => {
    expect(parseSkill("---\nmetadata:\n  reads: 'a.md b.md'\n---\n").reads).toEqual([
      'a.md',
      'b.md',
    ]);
    expect(parseSkill('---\nmetadata:\n  reads: a.md\n---\n').reads).toEqual(['a.md']);
    expect(parseSkill('---\r\nmetadata:\r\n  reads: "a.md"\r\n---\r\nb').reads).toEqual(['a.md']);
  });

  it('returns empty reads without frontmatter or without metadata.reads', () => {
    expect(parseSkill('# title\n\nbody')).toEqual({ reads: [], body: '# title\n\nbody' });
    expect(parseSkill('---\nname: a\n---\nbody').reads).toEqual([]);
    expect(parseSkill('---\nname: a\nmetadata:\n  other: "x"\n---\nbody').reads).toEqual([]);
  });

  it('strips a leading byte order mark before reading the frontmatter', () => {
    const s = '\uFEFF---\nname: a\nmetadata:\n  reads: "x.md"\n---\nbody';
    expect(parseSkill(s)).toEqual({ reads: ['x.md'], body: 'body' });
  });

  it('does not read a reads key that sits outside the metadata map', () => {
    expect(parseSkill('---\nmetadata:\n  a: b\nreads: "x.md"\n---\n').reads).toEqual([]);
    expect(parseSkill('---\nreads: "x.md"\n---\n').reads).toEqual([]);
  });
});

describe('what counts, and the guarded changes', () => {
  const view = (over = {}) => ({
    listing: [],
    notCounted: [],
    sharedPaths: ['a.md', 'b.md', 'new.md'],
    ...over,
  });
  const state = (over = {}, caps = CAPS) => ({ caps, view: view(over) });

  it('matches notCounted exactly, except a trailing slash entry, which matches as a prefix', () => {
    expect(isNotCounted('DESIGN.md', ['DESIGN.md'])).toBe(true);
    expect(isNotCounted('DESIGN.md.bak', ['DESIGN.md'])).toBe(false);
    expect(isNotCounted('docs/DESIGN.md', ['DESIGN.md'])).toBe(false);
    expect(isNotCounted('buildlog/x.md', ['buildlog/'])).toBe(true);
    expect(isNotCounted('buildlogs/x.md', ['buildlog/'])).toBe(false);
  });

  it('matches a shared path as a directory prefix or one exact file', () => {
    const shared = ['pipeline/**', 'AGENTS.md', '.claude/skills/build/**'];
    expect(isSharedPath('pipeline/steps/01-isolate.md', shared)).toBe(true);
    expect(isSharedPath('pipeline/PIPELINE.md', shared)).toBe(true);
    expect(isSharedPath('AGENTS.md', shared)).toBe(true);
    expect(isSharedPath('AGENTS.md.bak', shared)).toBe(false);
    expect(isSharedPath('pipelines/x.md', shared)).toBe(false);
    expect(isSharedPath('docs/AGENTS.md', shared)).toBe(false);
    expect(isSharedPath('.claude/skills/build/SKILL.md', shared)).toBe(true);
    expect(isSharedPath('.claude/skills/builder/SKILL.md', shared)).toBe(false);
  });

  it('counts each .md in the shared paths, minus the vendored root and notCounted', () => {
    const listing = [
      'a.md',
      'x.js',
      'README.md',
      'own.md',
      'buildlog/f.md',
      'buildlog/README.md',
      'vendor/skills/v/SKILL.md',
      'BUILDLOG.md',
      'shared/notes.txt',
      'shared/n.md',
    ];
    const sharedPaths = ['a.md', 'x.js', 'README.md', 'buildlog/**', 'vendor/**', 'shared/**'];
    const files = countInputs(
      view({ listing, sharedPaths, notCounted: ['buildlog/', 'BUILDLOG.md', 'README.md'] })
    );
    // own.md is tracked but not shared; x.js and notes.txt are not markdown
    expect(files).toEqual(['a.md', 'shared/n.md']);
  });

  it('never counts a file that is only on disk', () => {
    expect(countInputs(view({ listing: ['a.md'], sharedPaths: ['a.md', 'b.md'] }))).toEqual([
      'a.md',
    ]);
  });

  it('flags a raised cap, not a lowered or equal one', () => {
    const base = state();
    expect(guardedChanges(base, state({}, { total: 26000, reviewer: 10000 }))).toEqual([
      'budget.total raised from 25000 to 26000',
    ]);
    expect(guardedChanges(base, state({}, { total: 25000, reviewer: 10001 }))).toHaveLength(1);
    expect(guardedChanges(base, state({}, { total: 20000, reviewer: 10000 }))).toEqual([]);
    expect(guardedChanges(base, state())).toEqual([]);
  });

  it('flags a notCounted entry added, not one removed', () => {
    const base = state({ notCounted: ['a/'] });
    expect(guardedChanges(base, state({ notCounted: ['a/', 'DESIGN.md'] }))).toEqual([
      'budget.notCounted gained DESIGN.md',
    ]);
    expect(guardedChanges(base, state({ notCounted: [] }))).toEqual([]);
  });

  it('flags a counted file that still exists but is dropped by notCounted', () => {
    const listing = ['a.md', 'b.md'];
    const changes = guardedChanges(state({ listing }), state({ listing, notCounted: ['b.md'] }));
    expect(changes).toContain(
      'b.md was counted at the base and still exists, but is no longer counted'
    );
  });

  it('flags a counted file that leaves the shared paths while it still exists', () => {
    const listing = ['a.md', 'b.md'];
    const changes = guardedChanges(
      state({ listing, sharedPaths: ['a.md', 'b.md'] }),
      state({ listing, sharedPaths: ['a.md'] })
    );
    expect(changes).toEqual([
      'b.md was counted at the base and still exists, but is no longer counted',
    ]);
  });

  it('does not flag a counted file that leaves the count because the head retires it', () => {
    const listing = ['a.md', 'b.md'];
    const base = state({ listing, sharedPaths: ['a.md', 'b.md'] });
    const head = state({
      listing,
      sharedPaths: ['a.md'],
      retired: ['b.md'],
      exemptRetired: true,
    });
    expect(guardedChanges(base, head)).toEqual([]);
    // the parent (governanceHome self) gets no exemption
    const parent = state({ listing, sharedPaths: ['a.md'], retired: ['b.md'] });
    expect(guardedChanges(base, parent)).toHaveLength(1);
    // only the retired file is excused
    const other = state({ listing, sharedPaths: [], retired: ['b.md'], exemptRetired: true });
    expect(guardedChanges(base, other)).toEqual([
      'a.md was counted at the base and still exists, but is no longer counted',
    ]);
  });

  it('does not flag a file that was deleted, or one that is still counted', () => {
    const baseView = { listing: ['a.md', 'b.md'] };
    expect(guardedChanges(state(baseView), state({ listing: ['a.md'] }))).toEqual([]);
    expect(guardedChanges(state(baseView), state({ listing: ['a.md', 'b.md'] }))).toEqual([]);
  });

  it('passes a pure addition, with or without other files', () => {
    const base = state({ listing: ['a.md'] });
    const head = state({ listing: ['a.md', 'new.md', 'src.js'] });
    expect(guardedChanges(base, head)).toEqual([]);
    expect(guardFailures([], ['src.js', 'repo-profile.json'], {}, {})).toEqual([]);
  });

  it('requires a guarded change to be the only change, apart from buildlog files', () => {
    const changes = ['budget.total raised from 25000 to 26000'];
    const profile = { shipMode: 'pr', budget: { total: 25000 } };
    const raised = { shipMode: 'pr', budget: { total: 26000 } };
    expect(guardFailures(changes, ['repo-profile.json'], profile, raised)).toEqual([]);
    expect(
      guardFailures(
        changes,
        ['repo-profile.json', 'buildlog/93.md', 'BUILDLOG.md'],
        profile,
        raised
      )
    ).toEqual([]);
    const other = guardFailures(changes, ['repo-profile.json', 'standards/x.md'], profile, raised);
    expect(other.join('\n')).toContain('Other changed files: standards/x.md');
    expect(other.join('\n')).toContain('Guarded change: budget.total raised from 25000 to 26000');
  });

  it('fails other repo-profile.json edits that ride along with a budget change', () => {
    const changes = ['budget.total raised from 25000 to 26000'];
    const lines = guardFailures(
      changes,
      ['repo-profile.json'],
      { shipMode: 'pr', budget: { total: 25000 } },
      { shipMode: 'direct', budget: { total: 26000 } }
    );
    expect(lines.join('\n')).toContain('repo-profile.json also changes outside its budget key');
  });
});

describe('the wrapper, on temp git repos', () => {
  let repos;
  beforeEach(() => {
    repos = [];
  });
  afterEach(() => {
    for (const r of repos) fs.rmSync(r, { recursive: true, force: true });
  });

  const git = (cwd, ...args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t.test', '-c', 'commit.gpgsign=false', ...args],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  const put = (root, rel, body) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  };
  const words = (n) => Array(n).fill('w').join(' ');
  const PROFILE = {
    shipMode: 'pr',
    budget: { total: 25000, reviewer: 10000, notCounted: ['buildlog/'] },
  };
  const MANIFEST = {
    sharedPaths: [
      'a.md',
      'b.md',
      'AGENTS.md',
      'BUILDLOG.md',
      'buildlog/**',
      'other/**',
      'standards/**',
      '.claude/skills/**',
    ],
  };

  // A repo on branch main holding the base commit, then a branch `pr` for the change.
  function makeRepo(over = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'token-budget-git-'));
    repos.push(root);
    git(root, 'init', '-q', '-b', 'main');
    put(root, 'repo-profile.json', over.profile ?? PROFILE);
    if (over.manifest !== null) put(root, 'governance-manifest.json', over.manifest ?? MANIFEST);
    put(root, 'a.md', words(over.words ?? 100));
    put(root, '.claude/skills/reviewing-prs/SKILL.md', words(10));
    for (const [rel, body] of Object.entries(over.files ?? {})) put(root, rel, body);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
    git(root, 'checkout', '-q', '-b', 'pr');
    return root;
  }
  const commit = (root) => {
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'change');
  };
  const check = (root, argv = ['--base', 'main'], env = {}) => {
    const r = main({ root, argv, env });
    return { ...r, out: r.lines.join('\n') };
  };
  const raiseCap = (root) =>
    put(root, 'repo-profile.json', {
      ...PROFILE,
      budget: { ...PROFILE.budget, total: 26000 },
    });

  it('passes a run with no change and prints the counts', () => {
    const r = check(makeRepo());
    expect(r.exitCode).toBe(0);
    expect(r.out).toContain('in total (limit 25000)');
  });

  it('takes the caps from the profile, and fails a missing or non-numeric one on the head', () => {
    const root = makeRepo();
    put(root, 'repo-profile.json', { ...PROFILE, budget: { total: 100, reviewer: 10000 } });
    expect(check(root, []).out).toContain('FAIL, 149 tokens in total, over the 100 limit');
    put(root, 'repo-profile.json', { ...PROFILE, budget: { total: 25000 } });
    expect(check(root, []).out).toContain('budget.total and budget.reviewer must both be numbers');
    put(root, 'repo-profile.json', { ...PROFILE, budget: { total: 'x', reviewer: 1 } });
    expect(check(root, []).exitCode).toBe(1);
    put(root, 'repo-profile.json', { shipMode: 'pr' });
    expect(check(root, []).exitCode).toBe(1);
  });

  it('fails a malformed reviewer-library.json, never reads it as no library', () => {
    const root = makeRepo({ files: { 'vendor/skills/x/SKILL.md': 'tampered' } });
    for (const body of ['{}', '{"entries": null}', '{"entry": []}', 'null']) {
      put(root, 'reviewer-library.json', body);
      const r = check(root, []);
      expect(r.exitCode).toBe(1);
      expect(r.out).toContain('cannot read reviewer-library.json ("entries" must be an array)');
    }
  });

  it('fails a budget.notCounted that is not an array of strings, on the head and the base', () => {
    const bad = (notCounted) => ({ ...PROFILE, budget: { ...PROFILE.budget, notCounted } });
    const root = makeRepo();
    for (const notCounted of ['buildlog/', [1], {}]) {
      put(root, 'repo-profile.json', bad(notCounted));
      const r = check(root, []);
      expect(r.exitCode).toBe(1);
      expect(r.out).toContain('budget.notCounted in repo-profile.json must be an array of strings');
    }
    const onBase = makeRepo({ profile: bad('buildlog/') });
    put(onBase, 'repo-profile.json', PROFILE);
    commit(onBase);
    const r = check(onBase);
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain('budget.notCounted in repo-profile.json at main must be an array');
  });

  it('applies a notCounted prefix entry to the counts', () => {
    const root = makeRepo();
    put(root, 'buildlog/f.md', words(5000));
    put(root, 'other/f.md', words(5000));
    commit(root);
    const r = check(root, []);
    // a.md 100 + skill 10 + other/f.md 5000 = 5110 words -> 6899; buildlog/ is skipped
    expect(r.out).toContain('6899 tokens in total');
  });

  it('skips the guard on a push or a local run, and still counts', () => {
    const root = makeRepo();
    raiseCap(root);
    put(root, 'src.js', 'x');
    commit(root);
    for (const env of [{}, { GITHUB_EVENT_NAME: 'push' }]) {
      const r = check(root, [], env);
      expect(r.exitCode).toBe(0);
      expect(r.out).toContain('(limit 26000)');
    }
  });

  it('fails a pull_request or merge_group run with no base', () => {
    const root = makeRepo();
    const pr = check(root, [], { GITHUB_EVENT_NAME: 'pull_request' });
    expect(pr.exitCode).toBe(1);
    expect(pr.out).toContain('a pull_request event with no GITHUB_BASE_REF');
    const mg = check(root, [], { GITHUB_EVENT_NAME: 'merge_group' });
    expect(mg.exitCode).toBe(1);
    expect(mg.out).toContain('a merge_group event whose payload');
    expect(check(root, ['--base']).out).toContain('--base needs a ref');
  });

  it('takes the base from GITHUB_BASE_REF and from the merge_group payload', () => {
    const root = makeRepo();
    git(root, 'update-ref', 'refs/remotes/origin/main', 'main');
    raiseCap(root);
    put(root, 'src.js', 'x');
    commit(root);
    const pr = check(root, [], { GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main' });
    expect(pr.exitCode).toBe(1);
    expect(pr.out).toContain('Other changed files: src.js');
    const payload = path.join(root, '.event.json');
    const sha = git(root, 'rev-parse', 'main').trim();
    fs.writeFileSync(payload, JSON.stringify({ merge_group: { base_sha: sha } }));
    const mg = check(root, [], { GITHUB_EVENT_NAME: 'merge_group', GITHUB_EVENT_PATH: payload });
    expect(mg.exitCode).toBe(1);
    expect(mg.out).toContain('Other changed files: src.js');
  });

  it('fails when the base ref does not resolve', () => {
    const r = check(makeRepo(), ['--base', 'origin/nothing']);
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain('the base origin/nothing does not resolve to a commit');
  });

  it('fails, and does not read "no budget key", when the base profile or manifest cannot be read', () => {
    const noProfile = makeRepo();
    git(noProfile, 'checkout', '-q', 'main');
    git(noProfile, 'rm', '-q', 'repo-profile.json');
    git(noProfile, 'commit', '-q', '-m', 'drop profile');
    git(noProfile, 'checkout', '-q', 'pr');
    put(noProfile, 'repo-profile.json', PROFILE);
    const a = check(noProfile);
    expect(a.exitCode).toBe(1);
    expect(a.out).toContain('cannot read repo-profile.json at main');

    const brokenManifest = makeRepo();
    git(brokenManifest, 'checkout', '-q', 'main');
    put(brokenManifest, 'governance-manifest.json', '{ not json');
    git(brokenManifest, 'commit', '-q', '-am', 'break manifest');
    git(brokenManifest, 'checkout', '-q', 'pr');
    const b = check(brokenManifest);
    expect(b.exitCode).toBe(1);
    expect(b.out).toContain('cannot read governance-manifest.json at main');
  });

  it('passes a guarded change that is alone, or has only a buildlog fragment with it', () => {
    const root = makeRepo();
    raiseCap(root);
    commit(root);
    expect(check(root).exitCode).toBe(0);
    put(root, 'buildlog/93.md', 'note');
    commit(root);
    expect(check(root).exitCode).toBe(0);
  });

  it('fails a guarded change that has another file in the PR', () => {
    const root = makeRepo();
    raiseCap(root);
    put(root, 'standards/x.md', 'x');
    commit(root);
    const r = check(root);
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain('budget.total raised from 25000 to 26000');
    expect(r.out).toContain('Other changed files: standards/x.md');
  });

  it('fails a guarded change when a tracked file is renamed into buildlog/, and names the source', () => {
    const root = makeRepo({ files: { 'standards/x.md': 'x' } });
    raiseCap(root);
    fs.mkdirSync(path.join(root, 'buildlog'), { recursive: true });
    git(root, 'mv', 'standards/x.md', 'buildlog/x.md');
    commit(root);
    const r = check(root);
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain('Other changed files: standards/x.md');
  });

  it('fails other repo-profile.json edits riding on a budget change', () => {
    const root = makeRepo();
    put(root, 'repo-profile.json', {
      ...PROFILE,
      shipMode: 'direct',
      budget: { ...PROFILE.budget, reviewer: 12000 },
    });
    commit(root);
    const r = check(root);
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain('repo-profile.json also changes outside its budget key');
  });

  it('lets a pure addition land with its work', () => {
    const root = makeRepo();
    put(root, 'b.md', words(20));
    put(root, 'src.js', 'x');
    commit(root);
    expect(check(root).exitCode).toBe(0);
  });

  it('fails a counted file dropped from the shared paths while it still exists', () => {
    const root = makeRepo();
    put(root, 'governance-manifest.json', {
      sharedPaths: MANIFEST.sharedPaths.filter((e) => e !== 'a.md'),
    });
    commit(root);
    const r = check(root);
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain(
      'a.md was counted at the base and still exists, but is no longer counted'
    );
  });

  it('fails a still-present retired file in the parent (governanceHome self)', () => {
    const root = makeRepo();
    put(root, 'repo-profile.json', { ...PROFILE, governanceHome: 'self' });
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'self');
    git(root, 'checkout', '-q', '-b', 'pr2');
    put(root, 'governance-manifest.json', {
      sharedPaths: MANIFEST.sharedPaths.filter((e) => e !== 'a.md'),
      retired: [{ path: 'a.md', sha256: 'a'.repeat(64) }],
    });
    put(root, 'src.js', 'x');
    commit(root);
    const r = check(root, ['--base', 'pr']);
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain('a.md was counted at the base and still exists');
  });

  it('passes a still-present file that the head manifest retires, in a child', () => {
    const root = makeRepo();
    put(root, 'governance-manifest.json', {
      sharedPaths: MANIFEST.sharedPaths.filter((e) => e !== 'a.md'),
      retired: [{ path: 'a.md', sha256: 'a'.repeat(64) }],
    });
    put(root, 'src.js', 'x');
    commit(root);
    expect(check(root).exitCode).toBe(0);
  });

  it('passes a file deleted from the tree and from the shared paths', () => {
    const root = makeRepo();
    git(root, 'rm', '-q', 'a.md');
    put(root, 'governance-manifest.json', {
      sharedPaths: MANIFEST.sharedPaths.filter((e) => e !== 'a.md'),
    });
    put(root, 'src.js', 'x');
    commit(root);
    expect(check(root).exitCode).toBe(0);
  });

  it('counts a base with no manifest by the head shared paths', () => {
    const root = makeRepo({ manifest: null });
    put(root, 'governance-manifest.json', MANIFEST);
    put(root, 'src.js', 'x');
    commit(root);
    expect(check(root).exitCode).toBe(0);
  });

  it('fails a head manifest whose sharedPaths is not an array of strings', () => {
    const root = makeRepo();
    put(root, 'governance-manifest.json', { sharedPaths: 'a.md' });
    const r = check(root, []);
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain('sharedPaths in governance-manifest.json on the head must be an array');
  });

  it('turns the guard off when the base profile has no budget key', () => {
    const root = makeRepo({ profile: { shipMode: 'pr' } });
    put(root, 'repo-profile.json', {
      shipMode: 'direct',
      budget: { total: 26000, reviewer: 10000 },
    });
    put(root, 'src.js', 'x');
    commit(root);
    const r = check(root);
    expect(r.exitCode).toBe(0);
    expect(r.out).toContain('(limit 26000)');
  });

  it('reads a base with no budget key by the old caps and the old not-counted list', () => {
    const root = makeRepo({
      profile: { shipMode: 'pr' },
      words: 20000,
      files: { 'BUILDLOG.md': words(30000) },
    });
    put(root, 'repo-profile.json', {
      ...PROFILE,
      budget: { ...PROFILE.budget, notCounted: ['BUILDLOG.md', 'buildlog/'] },
    });
    commit(root);
    const r = check(root);
    // BUILDLOG.md is skipped at the base by the old list and at the head by the new one:
    // 20,010 words is 27014 tokens, over 25,000 at both ends
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain('27014 tokens in total, over the 25000 limit');
    expect(r.out).toContain('The base (main) was already over: 27014 tokens.');
  });

  it('says the base was under when this change put it over', () => {
    const root = makeRepo();
    put(root, 'a.md', words(20000));
    commit(root);
    const r = check(root);
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain('The base (main) was 149 tokens, under the limit.');
  });

  it('fails a vendored file that the library does not hash', () => {
    const root = makeRepo();
    put(root, 'vendor/skills/x/SKILL.md', 'hello');
    const r = check(root, []);
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain(
      'vendor/skills/x/SKILL.md is under vendor/skills/ but has no reviewer-library.json entry'
    );
  });
});

describe('the shipped profile', () => {
  const profile = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'repo-profile.json'), 'utf8')
  );

  it('keeps the caps and the not-counted list in the profile, as the live check reads them', () => {
    // Shape only: an owner-approved cap or not-counted change ships in a guarded PR that may touch
    // nothing but the profile and buildlog files, so the exact values cannot be pinned here.
    expect(typeof profile.budget.total).toBe('number');
    expect(typeof profile.budget.reviewer).toBe('number');
    expect(Array.isArray(profile.budget.notCounted)).toBe(true);
    for (const entry of profile.budget.notCounted) expect(typeof entry).toBe('string');
    expect(profile.budget.notCounted).toEqual(
      expect.arrayContaining(['BUILDLOG.md', 'DESIGN.md', 'buildlog/'])
    );
  });
});
