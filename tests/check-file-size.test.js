// tests/check-file-size.test.js
// Vitest tests for the file-size gate: the rules in scripts/check-file-size-core.js, and the
// wrapper's committed and --worktree modes on temp git repos.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { run, countLines, shapeError } = require('../scripts/check-file-size-core');
const { main } = require('../scripts/check-file-size');

const grown = (p, added = 10, deleted = 0) => ({ path: p, added, deleted });
const sizes = (map) => (p) => (p in map ? map[p] : null);
const text = (r) => r.lines.join('\n');

describe('the rules', () => {
  it('passes a grown file under the limit', () => {
    const r = run({ changes: [grown('a.js')], lineCount: sizes({ 'a.js': 800 }) });
    expect(r.exitCode).toBe(0);
    expect(text(r)).toContain('1 grown file(s) checked (limit 800)');
  });

  it('fails a grown file over the limit, naming the file, its size and both ways out', () => {
    const r = run({ changes: [grown('a.js')], lineCount: sizes({ 'a.js': 801 }) });
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('a.js grew to 801 lines, over the 800-line limit');
    expect(text(r)).toContain('Split the file');
    expect(text(r)).toContain('"lines": 801');
  });

  it('passes an allowed file under 1.2 times its recorded size, and fails it past that', () => {
    const fileSize = { allowed: [{ path: 'big.js', lines: 1000, why: 'one parser' }] };
    const under = run({
      changes: [grown('big.js')],
      lineCount: sizes({ 'big.js': 1199 }),
      fileSize,
    });
    expect(under.exitCode).toBe(0);
    const over = run({
      changes: [grown('big.js')],
      lineCount: sizes({ 'big.js': 1200 }),
      fileSize,
    });
    expect(over.exitCode).toBe(1);
    expect(text(over)).toContain('past 1.2 times the 1000 recorded');
  });

  it('ignores a file that shrank or held its size, however big', () => {
    const r = run({
      changes: [grown('a.js', 5, 9), grown('b.js', 3, 3)],
      lineCount: sizes({ 'a.js': 5000, 'b.js': 5000 }),
    });
    expect(r.exitCode).toBe(0);
    expect(text(r)).toContain('0 grown file(s)');
  });

  it('uses the repo limit when set, and 800 when unset', () => {
    const lineCount = sizes({ 'a.js': 500 });
    expect(run({ changes: [grown('a.js')], lineCount }).exitCode).toBe(0);
    expect(run({ changes: [grown('a.js')], lineCount, fileSize: { limit: 400 } }).exitCode).toBe(1);
  });

  it('skips binary files, deleted files, the build log and copied upstream files', () => {
    const r = run({
      changes: [
        { path: 'img.png', added: NaN, deleted: NaN },
        grown('gone.js'),
        grown('BUILDLOG.md'),
        grown('buildlog/1-2.md'),
        grown('package-lock.json'),
        grown('vendor/skills/acme/SKILL.md'),
        grown('.claude/skills/impeccable/scripts/live-browser.js'),
      ],
      lineCount: (p) => (p === 'gone.js' ? null : 9999),
    });
    expect(r.exitCode).toBe(0);
  });

  it('rejects a malformed fileSize', () => {
    expect(shapeError([])).toMatch(/must be an object/);
    expect(shapeError({ limit: 0 })).toMatch(/positive whole number/);
    expect(shapeError({ limit: '800' })).toMatch(/positive whole number/);
    expect(shapeError({ allowed: [{ path: 'a', lines: 10 }] })).toMatch(/needs a path/);
    expect(shapeError({ limit: 800, allowed: [{ path: 'a', lines: 10, why: 'x' }] })).toBeNull();
    expect(run({ changes: [], lineCount: sizes({}), fileSize: 'big' }).exitCode).toBe(1);
  });

  it('counts lines like wc -l, plus an unterminated last line', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
  });
});

describe('the wrapper, on temp git repos', () => {
  let dir;
  const sh = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n') + '\n';
  const write = (rel, body) => fs.writeFileSync(path.join(dir, rel), body);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-size-'));
    sh('init', '-q', '-b', 'main');
    sh('config', 'user.email', 't@t');
    sh('config', 'user.name', 't');
    write('repo-profile.json', JSON.stringify({ fileSize: { limit: 20 } }));
    write('a.js', lines(10));
    sh('add', '-A');
    sh('commit', '-qm', 'base');
    sh('branch', 'base');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const check = (...argv) => main({ root: dir, argv: [...argv, '--base', 'base'], env: {} });

  it('fails a committed file grown past the limit', () => {
    write('a.js', lines(30));
    sh('commit', '-qam', 'grow');
    expect(check().exitCode).toBe(1);
  });

  it('sees an uncommitted grown file only with --worktree', () => {
    write('a.js', lines(30));
    expect(check().exitCode).toBe(0);
    const r = check('--worktree');
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('a.js grew to 30 lines');
  });

  it('in a child, leaves a shared file to the parent and still judges its own files', () => {
    write(
      'repo-profile.json',
      JSON.stringify({ governanceHome: 'owner/governance', fileSize: { limit: 20 } })
    );
    write('governance-manifest.json', JSON.stringify({ sharedPaths: ['a.js'] }));
    write('a.js', lines(30));
    write('own.js', lines(30));
    const r = check('--worktree');
    expect(text(r)).not.toContain('a.js grew');
    expect(text(r)).toContain('own.js grew to 30 lines');
  });

  it('in the parent, still judges a shared file', () => {
    write('repo-profile.json', JSON.stringify({ governanceHome: 'self', fileSize: { limit: 20 } }));
    write('governance-manifest.json', JSON.stringify({ sharedPaths: ['a.js'] }));
    write('a.js', lines(30));
    expect(text(check('--worktree'))).toContain('a.js grew to 30 lines');
  });

  it('names an allowed file grown past the limit on the OK line', () => {
    write(
      'repo-profile.json',
      JSON.stringify({ fileSize: { limit: 20, allowed: [{ path: 'a.js', lines: 25, why: 'x' }] } })
    );
    write('a.js', lines(28));
    const r = check('--worktree');
    expect(r.exitCode).toBe(0);
    expect(text(r)).toContain('a.js (28 lines, recorded 25, allowed under 30)');
  });

  it('skips a new untracked binary file, and handles a path with a space', () => {
    fs.writeFileSync(
      path.join(dir, 'shot.png'),
      Buffer.concat([Buffer.from([0]), Buffer.from(lines(900))])
    );
    write('my file.js', lines(25));
    const r = check('--worktree');
    expect(text(r)).not.toContain('shot.png');
    expect(text(r)).toContain('my file.js grew to 25 lines');
  });

  it('sees a new untracked file with --worktree', () => {
    write('new.js', lines(25));
    const r = check('--worktree');
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('new.js grew to 25 lines');
  });
});
