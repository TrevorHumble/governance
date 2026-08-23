// tests/session-greeting.test.js
// Vitest tests for .claude/hooks/session-greeting.ps1: the SessionStart
// greeting's hook-liveness message. Liveness reads BOTH .githooks/commit-msg
// and .githooks/pre-commit, not commit-msg alone (see that script's own
// header), and the message must not claim protection when governanceHome
// is "self" -- the one repo-profile.json state where .githooks/pre-commit
// exits 0 without ever reading governance-manifest.json.
//
// Fixture composition: see makeFixture below. Launcher resolution: see
// tests/ps-launcher.js. Every case parses the script's JSON stdout and
// asserts on the systemMessage text it actually printed, never a literal
// comparison of the whole message.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const REPO_ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, '.claude', 'hooks', 'session-greeting.ps1');

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

function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

// Builds a scratch repo the greeting hook can run against. Both support
// scripts it dot-sources (tools/setup-hooks.ps1, tools/repo-profile-core.ps1)
// are copied in unconditionally: the script reads repo-profile-core.ps1 on
// every run, and setup-hooks.ps1 whenever commit-msg is present but the
// hooks aren't armed yet (the self-arm path).
function makeFixture(opts) {
  opts = opts || {};
  const dir = registerDir(fs.mkdtempSync(path.join(os.tmpdir(), 'session-greeting-fixture-')));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'test']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);

  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  for (const f of ['setup-hooks.ps1', 'repo-profile-core.ps1']) {
    fs.copyFileSync(path.join(REPO_ROOT, 'tools', f), path.join(dir, 'tools', f));
  }

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

  if (opts.profile !== undefined) {
    writeFile(dir, 'repo-profile.json', JSON.stringify(opts.profile));
  }

  return dir;
}

function runGreeting(dir) {
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
  });
  const stdout = (r.stdout || '').trim();
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // stdout wasn't valid JSON (a crash before the final Write-Output, say);
    // parsed stays null and the assertions below fail loud on message.
  }
  return {
    status: r.status,
    stdout,
    stderr: r.stderr || '',
    message: parsed ? parsed.systemMessage : null,
  };
}

const NON_SELF_PROFILE = { governanceHome: 'https://governance.invalid/parent.git', syncIssue: 1 };
const SELF_PROFILE = { governanceHome: 'self' };

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('session-greeting'))
  : describe;

maybeDescribe('.claude/hooks/session-greeting.ps1', () => {
  it('both hooks present, non-self profile: reports armed and protected', () => {
    const dir = makeFixture({ profile: NON_SELF_PROFILE });
    const res = runGreeting(dir);
    expect(res.message).not.toBeNull();
    expect(res.message).toContain('Gates armed');
    expect(res.message).toContain('commit-msg');
    expect(res.message).toContain('pre-commit');
    expect(res.message).toContain("You're protected");
  });

  it('only commit-msg present: reports pre-commit missing, not armed', () => {
    const dir = makeFixture({ preCommit: false });
    const res = runGreeting(dir);
    expect(res.message).not.toBeNull();
    expect(res.message).not.toContain("You're protected");
    expect(res.message).toContain('.githooks/pre-commit');
    expect(res.message).toContain('missing');
    expect(res.message).not.toContain('.githooks/commit-msg');
  });

  it('only pre-commit present: reports commit-msg missing, not armed', () => {
    const dir = makeFixture({ commitMsg: false });
    const res = runGreeting(dir);
    expect(res.message).not.toBeNull();
    expect(res.message).not.toContain("You're protected");
    expect(res.message).toContain('.githooks/commit-msg');
    expect(res.message).toContain('missing');
    expect(res.message).not.toContain('.githooks/pre-commit');
  });

  it('neither hook present: reports both missing, not armed', () => {
    const dir = makeFixture({ commitMsg: false, preCommit: false });
    const res = runGreeting(dir);
    expect(res.message).not.toBeNull();
    expect(res.message).not.toContain("You're protected");
    expect(res.message).toContain('.githooks/commit-msg');
    expect(res.message).toContain('.githooks/pre-commit');
    expect(res.message).toContain('missing');
  });

  it('governanceHome "self", both hooks present: reports the ownership hook as inert, not protection', () => {
    const dir = makeFixture({ profile: SELF_PROFILE });
    const res = runGreeting(dir);
    expect(res.message).not.toBeNull();
    expect(res.message).not.toContain("You're protected");
    expect(res.message).toContain('inert');
    expect(res.message).toContain('governance home');
    // The issue-reference hook is unaffected by governanceHome: still armed.
    expect(res.message).toContain('commit-msg hook is active');
  });

  it('no repo-profile.json at all, both hooks present: reports the ownership hook as inert, not protection', () => {
    const dir = makeFixture();
    const res = runGreeting(dir);
    expect(res.message).not.toBeNull();
    expect(res.message).not.toContain("You're protected");
    expect(res.message).toContain('inert');
    expect(res.message).toContain('no repo-profile.json declares this repo a child');
    // The issue-reference hook is unaffected by the missing profile: still armed.
    expect(res.message).toContain('commit-msg hook is active');
  });

  it('profile reader missing, both hooks present, non-self profile: reports unknown, not protection', () => {
    const dir = makeFixture({ profile: NON_SELF_PROFILE });
    fs.rmSync(path.join(dir, 'tools', 'repo-profile-core.ps1'));
    const res = runGreeting(dir);
    expect(res.message).not.toBeNull();
    expect(res.message).not.toContain("You're protected");
    expect(res.message).toContain('could not be read');
    // The issue-reference hook is unaffected by the missing reader: still armed.
    expect(res.message).toContain('commit-msg hook is active');
  });
});
