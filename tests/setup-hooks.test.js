// tests/setup-hooks.test.js
// Vitest tests for tools/setup-hooks.ps1: the git hook self-arm script.
// core.hooksPath pointing at .githooks does not mean either hook file is
// actually there, so the reported status must name what was actually found
// on disk (both, one, or neither) rather than asserting both are active on
// the strength of the git config alone -- see that script's own header.
//
// Fixture composition mirrors tests/session-greeting.test.js: a scratch git
// repo with .githooks/commit-msg and .githooks/pre-commit copied in or
// withheld per test. Every case runs the real script and asserts on the
// status text it actually printed, never a literal comparison.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const REPO_ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'tools', 'setup-hooks.ps1');

let dirs = [];

afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function registerDir(dir) {
  dirs.push(dir);
  return dir;
}

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${r.stderr}\n${r.stdout}`);
  }
  return r.stdout;
}

// Builds a scratch repo the setup-hooks script can run against. Real copies
// of the shipped hook files, not stand-ins: the point of these tests is
// whether the script reports what is actually on disk.
function makeFixture(opts) {
  opts = opts || {};
  const dir = registerDir(fs.mkdtempSync(path.join(os.tmpdir(), 'setup-hooks-fixture-')));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'test']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);

  fs.mkdirSync(path.join(dir, '.githooks'), { recursive: true });
  if (opts.commitMsg !== false) {
    fs.copyFileSync(
      path.join(REPO_ROOT, '.githooks', 'commit-msg'),
      path.join(dir, '.githooks', 'commit-msg')
    );
  }
  if (opts.preCommit !== false) {
    fs.copyFileSync(
      path.join(REPO_ROOT, '.githooks', 'pre-commit'),
      path.join(dir, '.githooks', 'pre-commit')
    );
  }

  return dir;
}

function runSetupHooks(dir) {
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
  });
  return {
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: r.stderr || '',
  };
}

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('setup-hooks'))
  : describe;

maybeDescribe('tools/setup-hooks.ps1', () => {
  it('both hooks present: reports both found and active', () => {
    const dir = makeFixture();
    const res = runSetupHooks(dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('core.hooksPath -> .githooks');
    expect(res.stdout).toContain(
      'commit-msg issue-reference and pre-commit ownership hooks found and active'
    );
    expect(git(dir, ['config', '--get', 'core.hooksPath']).trim()).toBe('.githooks');
  });

  it('only commit-msg present: reports pre-commit missing, not active', () => {
    const dir = makeFixture({ preCommit: false });
    const res = runSetupHooks(dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('only commit-msg was found on disk');
    expect(res.stdout).toContain('the other hook is missing and will not run');
    expect(res.stdout).not.toContain('found and active');
  });

  it('only pre-commit present: reports commit-msg missing, not active', () => {
    const dir = makeFixture({ commitMsg: false });
    const res = runSetupHooks(dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('only pre-commit was found on disk');
    expect(res.stdout).toContain('the other hook is missing and will not run');
    expect(res.stdout).not.toContain('found and active');
  });

  it('neither hook present: reports nothing will run', () => {
    const dir = makeFixture({ commitMsg: false, preCommit: false });
    const res = runSetupHooks(dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('no hook files were found on disk');
    expect(res.stdout).toContain('nothing will run');
    expect(res.stdout).not.toContain('found and active');
  });
});
