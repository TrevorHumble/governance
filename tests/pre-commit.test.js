// tests/pre-commit.test.js
// Vitest tests for .githooks/pre-commit: the parent-owned-path wall.
// Fixture composition: see makeFixture below. Launcher resolution: see
// tests/ps-launcher.js. The vacuous-fixture trap this suite guards against
// is recorded at tests/commit-msg.test.js's header.
//
// Each case WRITES its own repo-profile.json rather than copying this
// repo's own: this repo declares "governanceHome": "self", which would make
// every reject case below exit 0 for the wrong reason.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launcherMissing, skipTitle } = require('./ps-launcher');

const REPO_ROOT = path.join(__dirname, '..');
const HOOK_SRC = path.join(REPO_ROOT, '.githooks', 'pre-commit');
const REAL_MANIFEST_PATH = path.join(REPO_ROOT, 'governance-manifest.json');

// Every temp directory any case below creates is registered here the
// instant it exists, before any fallible work runs against it, so a case
// that throws mid-setup still gets cleaned up. One convention, file-wide.
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

// Builds a scratch repo with the hook armed. `*Raw` fields hold JSON a JS
// value can't express; omitTools/brokenTools drive the scan-failure cases.
function makeFixture(opts) {
  opts = opts || {};
  // The apostrophe here is load-bearing: it is what makes a broken sq() in
  // .githooks/pre-commit fail this suite. Do not tidy it away.
  const dir = registerDir(fs.mkdtempSync(path.join(os.tmpdir(), "pre-commit-fixture-o'brien-")));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'test']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  // core.hooksPath is deliberately NOT set yet: the seed below lands the
  // (possibly broken) profile/manifest as pre-existing repo state, as a
  // real child repo would after a sync, and must not itself be gated --
  // a broken seed would block its own creation, and a REAL manifest would
  // itself be a staged parent-owned path with no hook armed to object.

  fs.mkdirSync(path.join(dir, '.githooks'), { recursive: true });
  const hookDest = path.join(dir, '.githooks', 'pre-commit');
  fs.copyFileSync(HOOK_SRC, hookDest);
  fs.chmodSync(hookDest, 0o755);

  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  const omitTools = opts.omitTools || [];
  const brokenTools = opts.brokenTools || [];
  for (const f of ['ownership-core.ps1', 'governance-sync-core.ps1', 'repo-profile-core.ps1']) {
    if (omitTools.includes(f)) continue;
    if (brokenTools.includes(f)) {
      writeFile(dir, `tools/${f}`, 'function Test-Broken( {\n  "unterminated\n');
      continue;
    }
    fs.copyFileSync(path.join(REPO_ROOT, 'tools', f), path.join(dir, 'tools', f));
  }

  if (opts.manifestRaw !== undefined) {
    writeFile(dir, 'governance-manifest.json', opts.manifestRaw);
  } else if (opts.manifest === 'real') {
    fs.copyFileSync(REAL_MANIFEST_PATH, path.join(dir, 'governance-manifest.json'));
  }

  if (opts.profileRaw !== undefined) {
    writeFile(dir, 'repo-profile.json', opts.profileRaw);
  } else if (opts.profile !== undefined) {
    writeFile(dir, 'repo-profile.json', JSON.stringify(opts.profile));
  }

  writeFile(dir, 'README.md', 'fixture\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);

  // Arm the hook for every commit from here on -- exactly the commits each
  // test case makes via tryCommit below.
  git(dir, ['config', 'core.hooksPath', '.githooks']);

  return dir;
}

function tryCommit(dir, files, branch) {
  if (branch) {
    git(dir, ['checkout', '-q', '-b', branch]);
  }
  for (const [rel, content] of Object.entries(files)) {
    writeFile(dir, rel, content);
  }
  git(dir, ['add', '-A']);
  return spawnSync('git', ['commit', '-q', '-m', 'test commit'], { cwd: dir, encoding: 'utf8' });
}

const NON_SELF_PROFILE = { governanceHome: 'https://governance.invalid/parent.git', syncIssue: 1 };
const SELF_PROFILE = { governanceHome: 'self' };

// QUOTED_PATH carries an apostrophe and a space. It never reaches sq(): the
// hook reads staged paths inside PowerShell via git diff, not by embedding
// them in a command string; this constant exists only to prove the
// rejection message names such a path correctly.
const QUOTED_PATH = "standards/it's a test.md";

// QUOTED_BRANCH carries an apostrophe and does reach sq(), on a reject
// case where every branch a broken sq() can take still leaves it blocked.
const QUOTED_BRANCH = "feat/it's-mine";

// QUOTED_SYNC_BRANCH is the branch half of the accept path's escaping
// coverage: an explicit constant embedded in a PowerShell literal. A
// broken sq() unterminates that literal, so this case blocks instead of
// passing. The fixture root (see makeFixture) carries the other half,
// derived rather than explicit, covering the repo root and profile path.
const QUOTED_SYNC_BRANCH = "issue-7-governance-sync-abc1234-o'brien";

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('pre-commit'))
  : describe;

maybeDescribe('.githooks/pre-commit', () => {
  // Row 1: governanceHome non-self, a parent-owned path staged, a non-sync
  // branch: blocked, naming the path.
  it('blocks a non-sync-branch commit staging a parent-owned path, naming it', () => {
    const dir = makeFixture({ manifest: 'real', profile: NON_SELF_PROFILE });
    const res = tryCommit(dir, { [QUOTED_PATH]: 'edit\n' }, 'feat/whatever');
    expect(res.status).not.toBe(0);
    const out = `${res.stdout}${res.stderr}`;
    expect(out).toContain('BLOCKED');
    expect(out).toContain(QUOTED_PATH);
  });

  // Row 2: the identical change, on a governance-sync branch: accepted.
  it('accepts the identical change on a governance-sync branch', () => {
    const dir = makeFixture({ manifest: 'real', profile: NON_SELF_PROFILE });
    const res = tryCommit(dir, { 'standards/ownership-map.md': 'edit\n' }, QUOTED_SYNC_BRANCH);
    expect(res.status).toBe(0);
  });

  // Row 3: only a child-owned path staged (not a sharedPaths entry): accepted.
  it('accepts a non-sync-branch commit staging only a child-owned path', () => {
    const dir = makeFixture({ manifest: 'real', profile: NON_SELF_PROFILE });
    const res = tryCommit(dir, { 'tools/visual-surface.ps1': 'child script\n' }, 'feat/whatever');
    expect(res.status).toBe(0);
  });

  // Row 4: governanceHome is "self": accepted, and reachable only because
  // the hook truly never reads the manifest (deleted here, not just absent
  // by omission, to prove that).
  it('accepts on governanceHome "self", without ever reading the manifest', () => {
    const dir = makeFixture({ profile: SELF_PROFILE });
    expect(fs.existsSync(path.join(dir, 'governance-manifest.json'))).toBe(false);
    const res = tryCommit(dir, { 'standards/ownership-map.md': 'edit\n' }, 'feat/whatever');
    expect(res.status).toBe(0);
  });

  // Row 5: repo-profile.json absent: the wall is off, accepted.
  it('accepts when repo-profile.json is absent', () => {
    const dir = makeFixture({ manifest: 'real' });
    expect(fs.existsSync(path.join(dir, 'repo-profile.json'))).toBe(false);
    const res = tryCommit(dir, { 'standards/ownership-map.md': 'edit\n' }, 'feat/whatever');
    expect(res.status).toBe(0);
  });

  // Row 6: repo-profile.json present but unparseable: blocked, naming it,
  // never collapsed into the absent case.
  // This row alone can't tell a malformed profile apart from a broken
  // sq(): the fixture root's apostrophe makes both produce this message.
  it('blocks and names repo-profile.json when present but unparseable', () => {
    const dir = makeFixture({ manifest: 'real', profileRaw: '{ this is not json' });
    const res = tryCommit(dir, { 'standards/ownership-map.md': 'edit\n' }, 'feat/whatever');
    expect(res.status).not.toBe(0);
    const out = `${res.stdout}${res.stderr}`;
    expect(out).toContain('BLOCKED');
    expect(out).toContain('repo-profile.json');
  });

  // Row 7: a non-sync branch with governance-manifest.json missing: blocked,
  // naming it. The branch also carries an apostrophe (QUOTED_BRANCH), since
  // this is a non-SELF, non-parse-error case where the branch name reaches
  // the PowerShell command that resolves it.
  it('blocks and names governance-manifest.json when missing, on a non-sync branch', () => {
    const dir = makeFixture({ profile: NON_SELF_PROFILE });
    const res = tryCommit(dir, { 'notes.txt': 'anything\n' }, QUOTED_BRANCH);
    expect(res.status).not.toBe(0);
    const out = `${res.stdout}${res.stderr}`;
    expect(out).toContain('BLOCKED');
    expect(out).toContain('governance-manifest.json');
  });

  // governance-manifest.json present but unparseable, on a non-sync branch:
  // blocked, naming it.
  it('blocks and names governance-manifest.json when unparseable, on a non-sync branch', () => {
    const dir = makeFixture({
      manifestRaw: '{ this is not json',
      profile: NON_SELF_PROFILE,
    });
    const res = tryCommit(dir, { 'notes.txt': 'anything\n' }, 'feat/whatever');
    expect(res.status).not.toBe(0);
    const out = `${res.stdout}${res.stderr}`;
    expect(out).toContain('BLOCKED');
    expect(out).toContain('governance-manifest.json');
  });

  // The ownership scan doesn't complete when its PowerShell helper is
  // missing (dot-sourcing tools/ownership-core.ps1 fails): empty output
  // must never read as "nothing parent-owned staged" -- it must block,
  // naming the helper, since a missing/unloadable helper is not the same
  // failure as an unparseable manifest.
  it('blocks and names the helper when the ownership scan fails to complete: helper missing', () => {
    const dir = makeFixture({
      manifest: 'real',
      profile: NON_SELF_PROFILE,
      omitTools: ['ownership-core.ps1'],
    });
    const res = tryCommit(dir, { 'notes.txt': 'anything\n' }, 'feat/whatever');
    expect(res.status).not.toBe(0);
    const out = `${res.stdout}${res.stderr}`;
    expect(out).toContain('BLOCKED');
    expect(out).toContain('tools/ownership-core.ps1');
  });

  // Same failure, different cause: the helper is present but syntactically
  // invalid, so dot-sourcing it throws instead of finding nothing. Same
  // block, same name, per the row above.
  it('blocks and names the helper when the ownership scan fails to complete: helper unloadable', () => {
    const dir = makeFixture({
      manifest: 'real',
      profile: NON_SELF_PROFILE,
      brokenTools: ['ownership-core.ps1'],
    });
    const res = tryCommit(dir, { 'notes.txt': 'anything\n' }, 'feat/whatever');
    expect(res.status).not.toBe(0);
    const out = `${res.stdout}${res.stderr}`;
    expect(out).toContain('BLOCKED');
    expect(out).toContain('tools/ownership-core.ps1');
  });

  // governance-manifest.json parses but carries no sharedPaths array:
  // blocked. The wall must not be looser than Resolve-SharedSet about the
  // same corruption, where a manifest truncated to "{}" (e.g. by a careless
  // merge-conflict resolution) must not silently disarm the wall forever.
  it('blocks when governance-manifest.json parses but has no sharedPaths array', () => {
    const dir = makeFixture({
      manifestRaw: '{}',
      profile: NON_SELF_PROFILE,
    });
    const res = tryCommit(dir, { 'notes.txt': 'anything\n' }, 'feat/whatever');
    expect(res.status).not.toBe(0);
    const out = `${res.stdout}${res.stderr}`;
    expect(out).toContain('BLOCKED');
  });

  // A mixed-case sync-branch lookalike is not exempted. The sync only ever
  // builds lowercase branch names, and git branch names are case-sensitive,
  // so the mixed-case form can only be hand-made; it must not exempt a
  // parent-owned-path commit from the wall.
  it('does not exempt a mixed-case sync-branch lookalike', () => {
    const dir = makeFixture({ manifest: 'real', profile: NON_SELF_PROFILE });
    const res = tryCommit(
      dir,
      { 'standards/ownership-map.md': 'edit\n' },
      'Issue-7-Governance-Sync-abc1234'
    );
    expect(res.status).not.toBe(0);
    const out = `${res.stdout}${res.stderr}`;
    expect(out).toContain('BLOCKED');
    expect(out).toContain('standards/ownership-map.md');
  });
});

// Row 8: no PowerShell launcher on PATH. Invoked directly, not via
// `git commit` (whose ambient PATH always has a launcher, and whose
// Windows git resolves a bundled sh independent of process PATH), with a
// constructed PATH built to hold only what the hook needs.
// assertNoLauncherOnPath confirms PATH resolves neither launcher before
// the hook runs, so a launcher leak surfaces here instead of silently
// steering this case down a different branch of the hook.
describe('.githooks/pre-commit: launcher-absent case (always runs, independent of ps-launcher)', () => {
  // On POSIX: a scratch bin of symlinks to just what the hook calls (git,
  // sed, tr, head, tail), resolved via `which`, so nothing else on the
  // ambient PATH (a PowerShell package installed alongside git, as on
  // ubuntu-latest) can leak in.
  function buildScratchBin() {
    const dir = registerDir(fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-scratch-bin-')));
    for (const exe of ['git', 'sed', 'tr', 'head', 'tail']) {
      const w = spawnSync('which', [exe], { encoding: 'utf8' });
      const resolved = `${w.stdout || ''}`.split(/\r?\n/)[0].trim();
      if (!resolved) {
        throw new Error(`could not resolve ${exe} via which`);
      }
      fs.symlinkSync(resolved, path.join(dir, exe));
    }
    return dir;
  }

  function resolveGitLocations() {
    if (process.platform !== 'win32') {
      // buildScratchBin resolves git itself and throws if that resolution
      // is empty, so no separate candidates check is needed on this path.
      return { pathEntries: [buildScratchBin()], shPath: null };
    }
    const r = spawnSync('where', ['git'], { encoding: 'utf8' });
    const candidates = (r.stdout || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (candidates.length === 0) {
      throw new Error('could not resolve git via where');
    }
    // Windows `where` can return git.exe under either .../Git/cmd/git.exe or
    // .../Git/mingw64/bin/git.exe first, depending on PATH order, so the
    // install root sits either two or three directories up; try each
    // resolved git.exe at both climb depths until one actually has a
    // bundled sh.exe.
    for (const gitExe of candidates) {
      for (const climbs of [2, 3]) {
        let gitRoot = gitExe;
        for (let i = 0; i < climbs; i++) gitRoot = path.dirname(gitRoot);
        const cmdDir = path.join(gitRoot, 'cmd');
        const usrBinDir = path.join(gitRoot, 'usr', 'bin');
        const shCandidates = [path.join(gitRoot, 'bin', 'sh.exe'), path.join(usrBinDir, 'sh.exe')];
        const shPath = shCandidates.find((c) => fs.existsSync(c));
        if (shPath) {
          return { pathEntries: [cmdDir, usrBinDir], shPath };
        }
      }
    }
    throw new Error('could not resolve Git for Windows sh.exe from any candidate git.exe');
  }

  // Confirms, rather than assumes, that env's PATH resolves neither
  // launcher: run before the hook so a PATH that turns out to hold one
  // (see the ubuntu-latest /usr/bin case above) fails loudly here instead
  // of quietly changing which branch of the hook this case exercises.
  function assertNoLauncherOnPath(env, shPath) {
    const sh = shPath || '/bin/sh';
    const probe = spawnSync(
      sh,
      ['-c', 'command -v powershell 2>/dev/null; command -v pwsh 2>/dev/null; exit 0'],
      { encoding: 'utf8', env }
    );
    // A probe that never ran (spawn error) or exited non-zero leaves stdout
    // undefined/empty for the wrong reason; reading `found` first would let
    // that failure read as "confirmed clean" instead of "unconfirmed".
    if (probe.error || probe.status !== 0) {
      throw new Error(
        `precondition check itself failed to run (error: ${probe.error}, status: ${probe.status}); cannot confirm PATH resolves no launcher`
      );
    }
    const found = `${probe.stdout || ''}`.trim();
    if (found) {
      throw new Error(
        `precondition failed: constructed PATH resolves a launcher (${found}); this case cannot exercise the missing-launcher path it names`
      );
    }
  }

  it('exits non-zero and reports the missing launcher on stderr', () => {
    const dir = registerDir(fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-nolauncher-')));
    git(dir, ['init', '-q']);
    git(dir, ['config', 'user.name', 'test']);
    git(dir, ['config', 'user.email', 'test@example.invalid']);
    // The hook checks repo-profile.json's absence (the wall-is-off case)
    // before requiring a launcher, so a fixture with no profile at all
    // would exit 0 without ever reaching the launcher check this exercises.
    writeFile(dir, 'repo-profile.json', JSON.stringify(NON_SELF_PROFILE));

    const { pathEntries, shPath } = resolveGitLocations();
    const env = { PATH: pathEntries.join(path.delimiter) };
    if (process.platform === 'win32') {
      if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
      if (process.env.windir) env.windir = process.env.windir;
    }
    assertNoLauncherOnPath(env, shPath);

    const r = shPath
      ? spawnSync(shPath, [HOOK_SRC], { cwd: dir, encoding: 'utf8', env })
      : spawnSync(HOOK_SRC, [], { cwd: dir, encoding: 'utf8', env });

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('powershell');
    expect(r.stderr).toContain('pwsh');
  });
});
