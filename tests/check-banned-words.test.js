// tests/check-banned-words.test.js
// Vitest tests for the banned-words CI gate: scripts/check-banned-words-core.js directly, and
// scripts/check-banned-words.js against scratch git repos and this repo.
//
// Every banned string below is built from base64, never written as a literal, so this file's own
// source holds none of them.
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findBannedWords } = require('../scripts/check-banned-words-core');
const { main } = require('../scripts/check-banned-words');

const b64 = (s) => Buffer.from(s, 'base64').toString('utf8');
const P1 = b64('aG9zdGlsZQ==');
const P2 = b64('YXNzaG9sZQ==');
const P3 = b64('b3dlIHRoZSB3b3JrIG5vdGhpbmc=');
const FILL = b64('cG93ZXJmdWw=');
const FILL_LONGER = b64('cG93ZXJmdWxseQ==');

const file = (text, scope = 'all', p = 'a.md') => ({ path: p, text, scope });

describe('findBannedWords', () => {
  it.each([P1, P2, P3])('finds the phrase %s on its line', (phrase) => {
    const hits = findBannedWords([file(`one\ntwo ${phrase} three\nfour`)]);
    expect(hits).toEqual([{ path: 'a.md', line: 2, word: phrase }]);
  });

  it('finds a phrase split across a line break at its first line', () => {
    const [a, b, c, d] = P3.split(' ');
    const hits = findBannedWords([file(`x\n${a} ${b}\n${c} ${d}`)]);
    expect(hits).toEqual([{ path: 'a.md', line: 2, word: P3 }]);
  });

  it('finds a capitalised phrase and reports the list entry in lower case', () => {
    const hits = findBannedWords([file(P1.toUpperCase())]);
    expect(hits).toEqual([{ path: 'a.md', line: 1, word: P1 }]);
  });

  it('finds a phrase inside a longer word', () => {
    const hits = findBannedWords([file(`${P1}-by-default`)]);
    expect(hits).toHaveLength(1);
    expect(hits[0].word).toBe(P1);
  });

  it('finds a filler word with its path, line, and word', () => {
    const hits = findBannedWords([file(`ok\nvery ${FILL} tool`, 'all', 'x/y.md')]);
    expect(hits).toEqual([{ path: 'x/y.md', line: 2, word: FILL }]);
  });

  it('does not match a filler word inside a longer word', () => {
    expect(findBannedWords([file(`a ${FILL_LONGER} b`)])).toEqual([]);
  });

  it('ignores a filler word in a phrases-only file but still finds a phrase there', () => {
    expect(findBannedWords([file(FILL, 'phrases')])).toEqual([]);
    expect(findBannedWords([file(P2, 'phrases')])).toHaveLength(1);
  });

  it('sorts hits by path, then line', () => {
    const hits = findBannedWords([
      file(`\n${P1}`, 'all', 'b.md'),
      file(`${P2}\n\n${P1}`, 'all', 'a.md'),
    ]);
    expect(hits.map((h) => `${h.path}:${h.line}`)).toEqual(['a.md:1', 'a.md:3', 'b.md:2']);
  });
});

describe('main on a scratch repo', () => {
  const repos = [];
  afterEach(() => {
    for (const r of repos.splice(0)) fs.rmSync(r, { recursive: true, force: true });
  });

  const git = (root, ...args) =>
    execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const put = (root, rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };

  function makeRepo(files, { tree = true, track = true } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'banned-words-'));
    repos.push(root);
    git(root, 'init', '-q', '-b', 'main');
    put(
      root,
      'repo-profile.json',
      JSON.stringify({
        budget: { total: 25000, reviewer: 10000, notCounted: ['BUILDLOG.md', 'buildlog/'] },
      })
    );
    if (tree) {
      put(
        root,
        'new-tree.json',
        JSON.stringify({ files: [{ path: 'standards/s.md' }], pending: [{ path: 'CLAUDE.md' }] })
      );
    }
    for (const [rel, text] of Object.entries(files)) put(root, rel, text);
    if (track) {
      git(root, 'add', '-A');
      git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base');
    }
    return root;
  }

  it('fails on a phrase in a new-tree file and prints path:line', () => {
    const r = main({ root: makeRepo({ 'standards/s.md': `ok\n${P1}\n` }) });
    expect(r.exitCode).toBe(1);
    expect(r.lines).toContain(`standards/s.md:2: banned word "${P1}"`);
    expect(r.lines.at(-1)).toBe('banned words: 1 hit(s) in 1 file(s)');
  });

  it('fails on a filler word in a new-tree file and names the word', () => {
    const r = main({ root: makeRepo({ 'standards/s.md': `${FILL} thing` }) });
    expect(r.exitCode).toBe(1);
    expect(r.lines[0]).toBe(`standards/s.md:1: banned word "${FILL}"`);
  });

  it.each(['vendor/skills/x/SKILL.md', 'BUILDLOG.md', 'buildlog/1-2.md'])(
    'fails on a phrase in %s',
    (rel) => {
      const r = main({ root: makeRepo({ 'standards/s.md': 'ok', [rel]: P3 }) });
      expect(r.exitCode).toBe(1);
      expect(r.lines[0]).toBe(`${rel}:1: banned word "${P3}"`);
    }
  );

  it('passes a filler word in BUILDLOG.md', () => {
    const r = main({ root: makeRepo({ 'standards/s.md': 'ok', 'BUILDLOG.md': FILL }) });
    expect(r.exitCode).toBe(0);
  });

  it('scans the design file, which the budget count leaves out', () => {
    const r = main({
      root: makeRepo({ 'standards/s.md': 'ok', 'DESIGN.md': `${P1}\n${FILL}` }),
    });
    expect(r.exitCode).toBe(1);
    expect(r.lines).toContain(`DESIGN.md:1: banned word "${P1}"`);
    expect(r.lines).toContain(`DESIGN.md:2: banned word "${FILL}"`);
  });

  it('passes a phrase in a pending path', () => {
    const r = main({ root: makeRepo({ 'standards/s.md': 'ok', 'CLAUDE.md': P1 }) });
    expect(r.exitCode).toBe(0);
  });

  it('passes a phrase in an untracked file', () => {
    const root = makeRepo({ 'standards/s.md': 'ok' });
    put(root, 'BUILDLOG.md', P1);
    expect(main({ root }).exitCode).toBe(0);
  });

  it('checks the working copy, so an uncommitted edit is caught', () => {
    const root = makeRepo({ 'standards/s.md': 'ok' });
    put(root, 'standards/s.md', P2);
    expect(main({ root }).exitCode).toBe(1);
  });

  it('exits 0 on a clean tree and reports the count', () => {
    const r = main({ root: makeRepo({ 'standards/s.md': 'plain words' }) });
    expect(r).toEqual({ lines: ['banned words: clean (1 files checked)'], exitCode: 0 });
  });

  it('still checks every counted tracked .md file when new-tree.json is absent', () => {
    const root = makeRepo({ 'BUILDLOG.md': P1, 'top.md': `a ${FILL}` }, { tree: false });
    const r = main({ root });
    expect(r.exitCode).toBe(1);
    expect(r.lines).toContain(`BUILDLOG.md:1: banned word "${P1}"`);
    expect(r.lines).toContain(`top.md:1: banned word "${FILL}"`);
  });
});

describe('main on this repo', () => {
  it('passes, so the check does not trip on itself', () => {
    const r = main({ root: path.join(__dirname, '..') });
    expect(r.lines.join('\n')).toMatch(/clean/);
    expect(r.exitCode).toBe(0);
  });
});
