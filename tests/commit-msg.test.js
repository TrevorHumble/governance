// tests/commit-msg.test.js
// Vitest tests for .githooks/commit-msg: a code commit must name a GitHub
// issue (inline `(#N)`, a GitHub closing keyword + #N, or an issue-N branch);
// a doc-only commit (every staged path ending .md/.markdown) is exempt.
// Launcher resolution: see tests/ps-launcher.js.
//
// The fixture repo receives BOTH .githooks/commit-msg AND tools/issue-core.ps1:
// the hook resolves the latter relative to `git rev-parse --show-toplevel`
// (the fixture repo, once core.hooksPath points at its own .githooks).
// Copying only the hook leaves that lookup empty, and the hook fails closed
// on the accept case too -- silently passing a suite that never exercised it.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launcherMissing, skipTitle } = require('./ps-launcher');

const REPO_ROOT = path.join(__dirname, '..');

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${r.stderr}\n${r.stdout}`);
  }
  return r.stdout;
}

function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-msg-fixture-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'test']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['config', 'core.hooksPath', '.githooks']);

  fs.mkdirSync(path.join(dir, '.githooks'), { recursive: true });
  const hookDest = path.join(dir, '.githooks', 'commit-msg');
  fs.copyFileSync(path.join(REPO_ROOT, '.githooks', 'commit-msg'), hookDest);
  fs.chmodSync(hookDest, 0o755);

  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, 'tools', 'issue-core.ps1'),
    path.join(dir, 'tools', 'issue-core.ps1')
  );

  // A first, unrelated doc-only commit so every case below has an existing
  // HEAD to build on, keeping each case's diff to just what it stages.
  writeFile(dir, 'README.md', 'fixture\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed (#1)']);

  return dir;
}

function tryCommit(dir, files, message, branch) {
  if (branch) {
    git(dir, ['checkout', '-q', '-b', branch]);
  }
  for (const [rel, content] of Object.entries(files)) {
    writeFile(dir, rel, content);
  }
  git(dir, ['add', '-A']);
  return spawnSync('git', ['commit', '-q', '-m', message], { cwd: dir, encoding: 'utf8' });
}

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('commit-msg'))
  : describe;

maybeDescribe('.githooks/commit-msg', () => {
  let dir;

  beforeEach(() => {
    dir = makeFixture();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('blocks a code commit whose message names no issue', () => {
    const res = tryCommit(dir, { 'app.js': 'console.log(1);\n' }, 'add app');
    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toContain('BLOCKED');
  });

  it('accepts a code commit whose message carries an inline (#N) issue reference', () => {
    const res = tryCommit(dir, { 'app.js': 'console.log(1);\n' }, 'add app (#1)');
    expect(res.status).toBe(0);
  });

  it('accepts a doc-only commit (every staged path .md) with no issue reference', () => {
    const res = tryCommit(dir, { 'NOTES.md': 'notes\n' }, 'update notes');
    expect(res.status).toBe(0);
  });

  it('blocks a code file staged under docs/ even with no other files -- folder location does not exempt it', () => {
    const res = tryCommit(dir, { 'docs/evil.ps1': 'Write-Output 1\n' }, 'sneak in a script');
    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toContain('BLOCKED');
  });

  it('blocks a mixed commit (one .md + one code file) with no issue reference -- any non-doc path makes it CODE', () => {
    const res = tryCommit(
      dir,
      { 'app.js': 'console.log(1);\n', 'NOTES.md': 'notes\n' },
      'app plus notes'
    );
    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toContain('BLOCKED');
  });

  it('accepts a code commit with no inline issue reference when the branch name carries issue-N', () => {
    const res = tryCommit(dir, { 'app.js': 'console.log(1);\n' }, 'add app', 'feat/issue-42');
    expect(res.status).toBe(0);
  });
});
