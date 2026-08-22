// tests/governance-sync.test.js
// Vitest tests for tools/governance-sync-core.ps1 (pure planning logic) and
// tools/governance-sync.ps1 (the wrapper: configuration handling and the
// end-to-end pull-and-PR flow). Launcher resolution is shared: see
// tests/ps-launcher.js.
'use strict';

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const REPO_ROOT = path.join(__dirname, '..');
const CORE_SCRIPT = path.join(REPO_ROOT, 'tools', 'governance-sync-core.ps1');
const WRAPPER_SCRIPT = path.join(REPO_ROOT, 'tools', 'governance-sync.ps1');

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('governance-sync'))
  : describe;

// ---- generic helpers --------------------------------------------------

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${r.stderr}`);
  }
  return r.stdout;
}

function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function sha256hex(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function toArray(v) {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

// ---- Get-SyncPlan / Resolve-SharedSet (pure, dot-sourced) -------------

function runGetSyncPlan(parentRoot, childRoot, manifestObj) {
  const manifestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-manifest-'));
  const manifestPath = path.join(manifestDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifestObj));
  const cmd =
    `. '${CORE_SCRIPT}'; ` +
    `$m = (Get-Content -Raw '${manifestPath}') | ConvertFrom-Json; ` +
    `try { $plan = Get-SyncPlan -ParentRoot '${parentRoot}' -ChildRoot '${childRoot}' -Manifest $m; ` +
    `$plan | ConvertTo-Json -Depth 6 -Compress } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 9 }`;
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], {
    encoding: 'utf8',
  });
  fs.rmSync(manifestDir, { recursive: true, force: true });
  return r;
}

function parsePlan(raw) {
  const obj = JSON.parse(raw);
  return {
    Adds: toArray(obj.Adds),
    Updates: toArray(obj.Updates),
    IdenticalCount: obj.IdenticalCount,
    Prunes: toArray(obj.Prunes),
    RetainedDivergent: toArray(obj.RetainedDivergent),
    Warnings: toArray(obj.Warnings),
  };
}

maybeDescribe('Get-SyncPlan classification (AC 1)', () => {
  it('partitions shared files into Adds, Updates, and identical-neither by content, not count', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-parent-'));
    const child = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-child-'));
    writeFile(parent, 'shared/add-me.txt', 'brand new\n');
    writeFile(parent, 'shared/update-me.txt', 'v2\n');
    writeFile(parent, 'shared/same.txt', 'unchanged\n');
    writeFile(child, 'shared/update-me.txt', 'v1\n');
    writeFile(child, 'shared/same.txt', 'unchanged\n');

    const manifest = { retired: [], sharedPaths: ['shared/**'], excludedPaths: [] };
    const r = runGetSyncPlan(parent, child, manifest);
    expect(r.status).toBe(0);
    const plan = parsePlan(r.stdout);
    expect(plan.Adds).toEqual(['shared/add-me.txt']);
    expect(plan.Updates).toEqual(['shared/update-me.txt']);
    expect(plan.IdenticalCount).toBe(1);
  });

  it('prunes a retired path only when the child hash matches the recorded sha256', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-parent-'));
    const child = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-child-'));
    const pristine = 'retired content\n';
    writeFile(child, 'old/legacy.txt', pristine);
    const manifest = {
      retired: [{ path: 'old/legacy.txt', sha256: sha256hex(pristine) }],
      sharedPaths: [],
      excludedPaths: [],
    };
    const r = runGetSyncPlan(parent, child, manifest);
    expect(r.status).toBe(0);
    const plan = parsePlan(r.stdout);
    expect(plan.Prunes).toEqual(['old/legacy.txt']);
    expect(plan.RetainedDivergent).toEqual([]);
  });

  it('retains (never prunes) a retired path whose child hash diverges from the recorded sha256', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-parent-'));
    const child = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-child-'));
    writeFile(child, 'old/legacy.txt', 'a local edit no one recorded\n');
    const manifest = {
      retired: [{ path: 'old/legacy.txt', sha256: sha256hex('retired content\n') }],
      sharedPaths: [],
      excludedPaths: [],
    };
    const r = runGetSyncPlan(parent, child, manifest);
    expect(r.status).toBe(0);
    const plan = parsePlan(r.stdout);
    expect(plan.Prunes).toEqual([]);
    expect(plan.RetainedDivergent).toEqual(['old/legacy.txt']);
  });

  it('a retired path absent from the child appears in neither Prunes nor RetainedDivergent', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-parent-'));
    const child = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-child-'));
    const manifest = {
      retired: [{ path: 'old/never-existed.txt', sha256: sha256hex('anything\n') }],
      sharedPaths: [],
      excludedPaths: [],
    };
    const r = runGetSyncPlan(parent, child, manifest);
    expect(r.status).toBe(0);
    const plan = parsePlan(r.stdout);
    expect(plan.Prunes).toEqual([]);
    expect(plan.RetainedDivergent).toEqual([]);
  });

  it('warns exactly once when the child CLAUDE.md lacks the literal Governing-artifact-surface heading', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-parent-'));
    const child = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-child-'));
    writeFile(child, 'CLAUDE.md', '# CLAUDE.md\n\nNo such section here.\n');
    const manifest = { retired: [], sharedPaths: [], excludedPaths: [] };
    const r = runGetSyncPlan(parent, child, manifest);
    expect(r.status).toBe(0);
    const plan = parsePlan(r.stdout);
    expect(plan.Warnings).toHaveLength(1);
    expect(plan.Warnings[0]).toContain('Governing-artifact surface');
  });

  it('emits zero warnings when the child CLAUDE.md carries the literal heading', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-parent-'));
    const child = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-child-'));
    writeFile(child, 'CLAUDE.md', '# CLAUDE.md\n\n## Governing-artifact surface\n\nsome list\n');
    const manifest = { retired: [], sharedPaths: [], excludedPaths: [] };
    const r = runGetSyncPlan(parent, child, manifest);
    expect(r.status).toBe(0);
    const plan = parsePlan(r.stdout);
    expect(plan.Warnings).toEqual([]);
  });
});

// ---- Resolve-GhPath chain -----------------------------------------------

function runResolveGhPath(profileGhPath, opts) {
  opts = opts || {};
  const env = Object.assign({}, process.env);
  if (Object.prototype.hasOwnProperty.call(opts, 'ghPathEnv')) {
    env.GH_PATH = opts.ghPathEnv;
  } else {
    delete env.GH_PATH;
  }
  const profileArg = String(profileGhPath || '').replace(/'/g, "''");
  // Windows reinstates ProgramFiles into a child process's environment block
  // regardless of what is passed via spawn options (a per-machine variable
  // the OS repopulates at process-creation time, not a real "process env"
  // value an ordinary child_process.env override can suppress). Clearing it
  // from WITHIN the running script, rather than at spawn time, is what
  // actually neutralizes branch (c)'s guard for this one test.
  const clearProgramFiles = opts.clearProgramFiles
    ? '$env:ProgramFiles = $null; Remove-Item Env:\\PROGRAMFILES -ErrorAction SilentlyContinue; '
    : '';
  const cmd =
    `${clearProgramFiles}. '${CORE_SCRIPT}'; try { $r = Resolve-GhPath -ProfileGhPath '${profileArg}'; Write-Output $r } ` +
    `catch { [Console]::Error.WriteLine($_.Exception.Message); exit 9 }`;
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], {
    encoding: 'utf8',
    env,
  });
  return {
    status: r.status === null ? 1 : r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

maybeDescribe('Resolve-GhPath chain', () => {
  it('branch (a): a profile value naming an existing fixture file resolves to it, GH_PATH unset', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-gh-'));
    const fixture = path.join(dir, 'gh-fixture.ps1');
    fs.writeFileSync(fixture, 'exit 0\n');
    const r = runResolveGhPath(fixture);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().toLowerCase()).toBe(fixture.toLowerCase());
  });

  it('branch (b): an unresolvable profile value falls through to GH_PATH, when set to an existing file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-gh-'));
    const fixture = path.join(dir, 'gh-fixture-b.ps1');
    fs.writeFileSync(fixture, 'exit 0\n');
    const r = runResolveGhPath('totally-bogus-command-name-xyz', { ghPathEnv: fixture });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().toLowerCase()).toBe(fixture.toLowerCase());
  });

  it('branch (d): with GH_PATH unset and the vendor-default probe neutralized, no probe resolves and it throws', () => {
    const r = runResolveGhPath('totally-bogus-command-name-xyz', { clearProgramFiles: true });
    expect(r.status).toBe(9);
    expect(r.stderr.trim().length).toBeGreaterThan(0);
  });
});

// ---- wrapper: configuration handling (AC 2) ------------------------------

function runWrapper(args, envExtra) {
  const fullArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WRAPPER_SCRIPT].concat(
    args
  );
  const env = Object.assign({}, process.env, envExtra || {});
  const r = spawnSync(PS, fullArgs, { encoding: 'utf8', env });
  return {
    status: r.status === null ? 1 : r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

maybeDescribe('governance-sync.ps1 configuration handling (AC 2)', () => {
  it('this repo declares governanceHome: self -- no-op, exit 0, branch list and status unchanged', () => {
    const beforeBranches = git(REPO_ROOT, ['branch', '--list']);
    const beforeStatus = git(REPO_ROOT, ['status', '--porcelain']);
    const r = runWrapper([]);
    const afterBranches = git(REPO_ROOT, ['branch', '--list']);
    const afterStatus = git(REPO_ROOT, ['status', '--porcelain']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('governance home: this repo is the governance home');
    expect(r.stdout).not.toContain('sync PR');
    expect(afterBranches).toBe(beforeBranches);
    expect(afterStatus).toBe(beforeStatus);
  });

  it('a profile with no governanceHome field: not declared, exit 0, branch list and status unchanged, proving the default derives from -ChildRoot', () => {
    const child = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-cfg-'));
    git(child, ['init', '-q']);
    git(child, ['config', 'user.name', 'test']);
    git(child, ['config', 'user.email', 'test@example.invalid']);
    writeFile(child, 'repo-profile.json', JSON.stringify({ defaultBranch: 'main' }));
    git(child, ['add', '-A']);
    git(child, ['commit', '-q', '-m', 'seed child']);

    const beforeBranches = git(child, ['branch', '--list']);
    const beforeStatus = git(child, ['status', '--porcelain']);
    const r = runWrapper(['-ChildRoot', child]);
    const afterBranches = git(child, ['branch', '--list']);
    const afterStatus = git(child, ['status', '--porcelain']);

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('not declared');
    expect(afterBranches).toBe(beforeBranches);
    expect(afterStatus).toBe(beforeStatus);
  });

  it('a corrupt (unparsable) profile via -ProfilePath: exit 1, non-empty stderr', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-cfg-'));
    const profilePath = path.join(dir, 'bad.json');
    fs.writeFileSync(profilePath, '{ this is not json');
    const r = runWrapper(['-ChildRoot', dir, '-ProfilePath', profilePath]);
    expect(r.status).toBe(1);
    expect(r.stderr.trim().length).toBeGreaterThan(0);
  });

  it('a missing profile via -ProfilePath: exit 1, non-empty stderr', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-cfg-'));
    const profilePath = path.join(dir, 'does-not-exist.json');
    const r = runWrapper(['-ChildRoot', dir, '-ProfilePath', profilePath]);
    expect(r.status).toBe(1);
    expect(r.stderr.trim().length).toBeGreaterThan(0);
  });

  it('a non-self home with no syncIssue: exit 1 before any clone or network access', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-cfg-'));
    writeFile(
      dir,
      'repo-profile.json',
      JSON.stringify({ governanceHome: 'https://sync.invalid/parent.git', defaultBranch: 'main' })
    );
    const r = runWrapper(['-ChildRoot', dir]);
    expect(r.status).toBe(1);
    expect(r.stderr.trim().length).toBeGreaterThan(0);
    expect(r.stdout).not.toContain('sync PR opened');
  });
});

// ---- wrapper: end-to-end fixture family (AC 6) ---------------------------

function makeGhStub(dir) {
  const stubPath = path.join(dir, 'gh-stub.ps1');
  const lines = [
    '$a = $args',
    "if ($a.Count -ge 2 -and $a[0] -eq 'pr' -and $a[1] -eq 'list') {",
    '  if ($env:STUB_OPEN_PR) {',
    '    Write-Output (\'[{"url":"\' + $env:STUB_OPEN_PR + \'"}]\')',
    '  } else {',
    "    Write-Output '[]'",
    '  }',
    '  exit 0',
    '}',
    "if ($a.Count -ge 2 -and $a[0] -eq 'pr' -and $a[1] -eq 'create') {",
    "  Write-Output 'https://github.invalid/owner/repo/pull/999'",
    '  exit 0',
    '}',
    "if ($a.Count -ge 2 -and $a[0] -eq 'pr' -and $a[1] -eq 'edit') {",
    '  exit 0',
    '}',
    'exit 1',
  ];
  fs.writeFileSync(stubPath, lines.join('\n') + '\n');
  return stubPath;
}

const PRISTINE_LEGACY = 'pristine legacy content\n';
const LEGACY_SHA = sha256hex(PRISTINE_LEGACY);
const HOOK_REL_PATH = '.githooks/example-hook';

function baseManifest() {
  return {
    retired: [{ path: 'legacy/old.txt', sha256: LEGACY_SHA }],
    // '.githooks/**' resolves to zero files for every existing case below
    // (none of them puts a file under parentDir/.githooks), per
    // Resolve-SharedSet's "directory absent: zero files, not an error"
    // contract; it exists here only so the AC8 mode-preservation case can
    // add a file under it and exercise a real end-to-end run.
    sharedPaths: ['shared/**', '.githooks/**'],
    excludedPaths: ['repo-profile.json', 'CLAUDE.md'],
  };
}

// Builds: a parent (governance home) repo, a bare origin, a seed-child commit
// pushed to origin on `trunk` (both the fixture's actual and profile-declared
// default branch, per AC 6's rationale: a wrapper reading any profile but the
// child's own targets a nonexistent ref and fails), and `child`, the invoking
// checkout the wrapper operates against. `opts.parentHello` and
// `opts.childLegacy` let a case diverge parent/child content before the
// fixture is built; `opts.syncIssue` overrides the default issue number;
// `opts.childGitignore` seeds the child's own `.gitignore` content;
// `opts.childHook` seeds HOOK_REL_PATH in the child's initial commit (mode
// 100644, since writing the file sets no exec bit), for a case that then
// gives the parent the same content under the same path.
function makeE2EFixture(opts) {
  opts = opts || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsync-e2e-'));
  const parentDir = path.join(root, 'parent');
  const originDir = path.join(root, 'origin.git');
  const seedChildDir = path.join(root, 'seed-child');
  const childDir = path.join(root, 'child');
  const ghStubPath = makeGhStub(root);
  const syncIssue = opts.syncIssue || 42;

  fs.mkdirSync(parentDir);
  git(parentDir, ['init', '-q']);
  git(parentDir, ['config', 'user.name', 'test']);
  git(parentDir, ['config', 'user.email', 'test@example.invalid']);
  writeFile(parentDir, 'governance-manifest.json', JSON.stringify(baseManifest(), null, 2));
  writeFile(
    parentDir,
    'shared/hello.txt',
    opts.parentHello !== undefined ? opts.parentHello : 'v1\n'
  );
  git(parentDir, ['add', '-A']);
  git(parentDir, ['commit', '-q', '-m', 'seed parent']);

  fs.mkdirSync(originDir);
  git(originDir, ['init', '--bare', '-q']);

  fs.mkdirSync(seedChildDir);
  git(seedChildDir, ['init', '-q']);
  git(seedChildDir, ['config', 'user.name', 'test']);
  git(seedChildDir, ['config', 'user.email', 'test@example.invalid']);
  writeFile(
    seedChildDir,
    'repo-profile.json',
    JSON.stringify(
      {
        governanceHome: parentDir,
        syncIssue: syncIssue,
        defaultBranch: 'trunk',
        ghPath: 'gh-stub-does-not-exist-on-path',
      },
      null,
      2
    )
  );
  writeFile(
    seedChildDir,
    'CLAUDE.md',
    '# CLAUDE.md\n\n## Governing-artifact surface\n\nsome list\n'
  );
  writeFile(seedChildDir, 'shared/hello.txt', 'v1\n');
  if (opts.childLegacy !== undefined) {
    writeFile(seedChildDir, 'legacy/old.txt', opts.childLegacy);
  }
  if (opts.childGitignore !== undefined) {
    writeFile(seedChildDir, '.gitignore', opts.childGitignore);
  }
  if (opts.childHook !== undefined) {
    writeFile(seedChildDir, HOOK_REL_PATH, opts.childHook);
  }
  git(seedChildDir, ['add', '-A']);
  git(seedChildDir, ['commit', '-q', '-m', 'seed child']);
  git(seedChildDir, ['branch', '-M', 'trunk']);
  git(seedChildDir, ['remote', 'add', 'origin', originDir]);
  git(seedChildDir, ['push', '-q', 'origin', 'trunk']);

  git(root, ['clone', '-q', originDir, childDir]);
  git(childDir, ['checkout', '-q', '-B', 'trunk', 'origin/trunk']);
  git(childDir, ['config', 'user.name', 'test']);
  git(childDir, ['config', 'user.email', 'test@example.invalid']);

  const parentSha = git(parentDir, ['rev-parse', 'HEAD']).trim();
  const shortSha = parentSha.substring(0, 8);
  const branchName = `issue-${syncIssue}-governance-sync-${shortSha}`;

  return {
    root,
    parentDir,
    originDir,
    seedChildDir,
    childDir,
    ghStubPath,
    syncIssue,
    parentSha,
    shortSha,
    branchName,
  };
}

function runE2EWrapper(fx, extraArgs, extraEnv) {
  return runWrapper(
    ['-ChildRoot', fx.childDir].concat(extraArgs || []),
    Object.assign({ GH_PATH: fx.ghStubPath }, extraEnv || {})
  );
}

maybeDescribe('governance-sync.ps1 end-to-end (AC 6)', () => {
  it('happy path: exits 0, ends stdout with sync PR opened, pushes a trunk-based branch carrying the update', () => {
    const fx = makeE2EFixture({});
    writeFile(fx.parentDir, 'shared/hello.txt', 'v2\n');
    git(fx.parentDir, ['add', '-A']);
    git(fx.parentDir, ['commit', '-q', '-m', 'update hello']);
    const parentSha = git(fx.parentDir, ['rev-parse', 'HEAD']).trim();
    const shortSha = parentSha.substring(0, 8);
    const branchName = `issue-${fx.syncIssue}-governance-sync-${shortSha}`;

    const r = runE2EWrapper(fx);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n').pop()).toMatch(/^sync PR opened: /);

    const branchList = git(fx.originDir, ['branch', '--list', branchName]);
    expect(branchList).toContain(branchName);
    const pushedContent = git(fx.originDir, ['show', `${branchName}:shared/hello.txt`]);
    expect(pushedContent).toBe('v2\n');
  });

  it('a child .gitignore ignoring a shared file does not stop the sync: the file still ships, and the .gitignore itself is untouched', () => {
    const gitignoreContent = 'shared/ignored-in-child.txt\n';
    const fx = makeE2EFixture({ childGitignore: gitignoreContent });
    // A new shared file the child does not have yet (an Add, not an Update):
    // only an Add gets silently dropped by `git add -A` under a child's own
    // .gitignore, since gitignore never hides a change to an already-tracked
    // path.
    writeFile(fx.parentDir, 'shared/ignored-in-child.txt', 'parent content\n');
    git(fx.parentDir, ['add', '-A']);
    git(fx.parentDir, ['commit', '-q', '-m', 'add a file the child gitignores']);
    const parentSha = git(fx.parentDir, ['rev-parse', 'HEAD']).trim();
    const shortSha = parentSha.substring(0, 8);
    const branchName = `issue-${fx.syncIssue}-governance-sync-${shortSha}`;

    const r = runE2EWrapper(fx);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n').pop()).toMatch(/^sync PR opened: /);

    const pushedContent = git(fx.originDir, ['show', `${branchName}:shared/ignored-in-child.txt`]);
    expect(pushedContent).toBe('parent content\n');
    const pushedGitignore = git(fx.originDir, ['show', `${branchName}:.gitignore`]);
    expect(pushedGitignore).toBe(gitignoreContent);
  });

  it('same-tree invariant: a retired path diverged on origin/trunk but pristine in the invoking checkout survives on the pushed branch', () => {
    const fx = makeE2EFixture({ childLegacy: PRISTINE_LEGACY });
    // Advance origin/trunk with a diverged copy of the retired path, pushed
    // from a throwaway sibling clone (the invoking checkout must NOT see
    // this via a fetch+merge; it stays on its own stale local copy).
    const siblingDir = path.join(fx.root, 'sibling');
    git(fx.root, ['clone', '-q', fx.originDir, siblingDir]);
    git(siblingDir, ['checkout', '-q', '-B', 'trunk', 'origin/trunk']);
    git(siblingDir, ['config', 'user.name', 'test']);
    git(siblingDir, ['config', 'user.email', 'test@example.invalid']);
    writeFile(siblingDir, 'legacy/old.txt', 'diverged on origin\n');
    git(siblingDir, ['add', '-A']);
    git(siblingDir, ['commit', '-q', '-m', 'diverge legacy on origin']);
    git(siblingDir, ['push', '-q', 'origin', 'trunk']);

    // Overwrite the invoking checkout's own copy back to pristine content
    // WITHOUT committing: the working tree hashes clean while origin/trunk
    // holds the divergence -- a plan computed against the invoking tree
    // would prune it; a plan computed against origin/trunk must not.
    writeFile(fx.childDir, 'legacy/old.txt', PRISTINE_LEGACY);

    // Force a non-empty plan (a bare RetainedDivergent entry alone opens no
    // PR) by updating the parent's shared file too.
    writeFile(fx.parentDir, 'shared/hello.txt', 'v2\n');
    git(fx.parentDir, ['add', '-A']);
    git(fx.parentDir, ['commit', '-q', '-m', 'update hello']);
    const parentSha = git(fx.parentDir, ['rev-parse', 'HEAD']).trim();
    const shortSha = parentSha.substring(0, 8);
    const branchName = `issue-${fx.syncIssue}-governance-sync-${shortSha}`;

    const r = runE2EWrapper(fx);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('WARNING retained divergent: legacy/old.txt');

    const pushedLegacy = git(fx.originDir, ['show', `${branchName}:legacy/old.txt`]);
    expect(pushedLegacy).toBe('diverged on origin\n');
  });

  it('divergence-only child: exits 0 with in sync plus one WARNING retained divergent line, no PR attempted', () => {
    const fx = makeE2EFixture({ childLegacy: 'a local edit no one recorded\n' });
    const r = runE2EWrapper(fx);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('in sync with');
    const warningLines = r.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('WARNING'));
    expect(warningLines).toEqual(['WARNING retained divergent: legacy/old.txt']);
    expect(r.stdout).not.toContain('sync PR');
  });

  it('a stale remote sync branch is force-updated to the fresh plan, PR marker: sync PR opened (empty PR list)', () => {
    const fx = makeE2EFixture({});
    writeFile(fx.parentDir, 'shared/hello.txt', 'v2\n');
    git(fx.parentDir, ['add', '-A']);
    git(fx.parentDir, ['commit', '-q', '-m', 'update hello']);
    const parentSha = git(fx.parentDir, ['rev-parse', 'HEAD']).trim();
    const shortSha = parentSha.substring(0, 8);
    const branchName = `issue-${fx.syncIssue}-governance-sync-${shortSha}`;

    // Pre-push a stale branch of the exact name the run will compute, with
    // content the fresh plan does NOT produce.
    const staleDir = path.join(fx.root, 'stale');
    git(fx.root, ['clone', '-q', fx.originDir, staleDir]);
    git(staleDir, ['checkout', '-q', '-b', branchName, 'origin/trunk']);
    git(staleDir, ['config', 'user.name', 'test']);
    git(staleDir, ['config', 'user.email', 'test@example.invalid']);
    writeFile(staleDir, 'shared/hello.txt', 'stale content, not v1 or v2\n');
    git(staleDir, ['add', '-A']);
    git(staleDir, ['commit', '-q', '-m', 'stale sync branch']);
    git(staleDir, ['push', '-q', 'origin', branchName]);

    const r = runE2EWrapper(fx);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n').pop()).toMatch(/^sync PR opened: /);
    const pushedContent = git(fx.originDir, ['show', `${branchName}:shared/hello.txt`]);
    expect(pushedContent).toBe('v2\n');
  });

  it('a stale remote sync branch under an already-open PR: force-updated, PR marker: sync PR open', () => {
    const fx = makeE2EFixture({});
    writeFile(fx.parentDir, 'shared/hello.txt', 'v2\n');
    git(fx.parentDir, ['add', '-A']);
    git(fx.parentDir, ['commit', '-q', '-m', 'update hello']);
    const parentSha = git(fx.parentDir, ['rev-parse', 'HEAD']).trim();
    const shortSha = parentSha.substring(0, 8);
    const branchName = `issue-${fx.syncIssue}-governance-sync-${shortSha}`;

    const staleDir = path.join(fx.root, 'stale');
    git(fx.root, ['clone', '-q', fx.originDir, staleDir]);
    git(staleDir, ['checkout', '-q', '-b', branchName, 'origin/trunk']);
    git(staleDir, ['config', 'user.name', 'test']);
    git(staleDir, ['config', 'user.email', 'test@example.invalid']);
    writeFile(staleDir, 'shared/hello.txt', 'stale content, not v1 or v2\n');
    git(staleDir, ['add', '-A']);
    git(staleDir, ['commit', '-q', '-m', 'stale sync branch']);
    git(staleDir, ['push', '-q', 'origin', branchName]);

    const r = runE2EWrapper(fx, [], { STUB_OPEN_PR: 'https://github.invalid/owner/repo/pull/7' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n').pop()).toBe(
      'sync PR open: https://github.invalid/owner/repo/pull/7'
    );
    const pushedContent = git(fx.originDir, ['show', `${branchName}:shared/hello.txt`]);
    expect(pushedContent).toBe('v2\n');
  });

  it('a .githooks/ file delivered by a real sync run lands on the pushed sync branch at mode 100755 (AC8)', () => {
    const fx = makeE2EFixture({});
    writeFile(fx.parentDir, HOOK_REL_PATH, '#!/bin/sh\nexit 0\n');
    git(fx.parentDir, ['add', '-A']);
    git(fx.parentDir, ['commit', '-q', '-m', 'add a githooks file to sync']);
    const parentSha = git(fx.parentDir, ['rev-parse', 'HEAD']).trim();
    const shortSha = parentSha.substring(0, 8);
    const branchName = `issue-${fx.syncIssue}-governance-sync-${shortSha}`;

    const r = runE2EWrapper(fx);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n').pop()).toMatch(/^sync PR opened: /);

    // Read from the pushed origin branch tree, a faithful readout of the sync
    // worktree's index: the sync never touches the child directory's own index.
    const lsTreeOut = git(fx.originDir, ['ls-tree', branchName, '--', HOOK_REL_PATH]).trim();
    expect(lsTreeOut).toMatch(/^100755 blob /);
  });

  it('a .githooks/ file the child already holds at mode 100644 with content identical to the parent is restaged to 100755 (AC8 mode-only repair)', () => {
    const hookContent = '#!/bin/sh\nexit 0\n';
    const fx = makeE2EFixture({ childHook: hookContent });
    // Identical bytes to the child's copy: content-hash plan puts it in neither Adds nor Updates.
    // The shared/hello.txt change keeps the plan non-empty so the run
    // actually proceeds (an empty plan exits before any restaging).
    writeFile(fx.parentDir, HOOK_REL_PATH, hookContent);
    writeFile(fx.parentDir, 'shared/hello.txt', 'v2\n');
    git(fx.parentDir, ['add', '-A']);
    git(fx.parentDir, ['commit', '-q', '-m', 'add identical githooks content and update hello']);
    const parentSha = git(fx.parentDir, ['rev-parse', 'HEAD']).trim();
    const shortSha = parentSha.substring(0, 8);
    const branchName = `issue-${fx.syncIssue}-governance-sync-${shortSha}`;

    const r = runE2EWrapper(fx);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n').pop()).toMatch(/^sync PR opened: /);

    const lsTreeOut = git(fx.originDir, ['ls-tree', branchName, '--', HOOK_REL_PATH]).trim();
    expect(lsTreeOut).toMatch(/^100755 blob /);
  });

  it('-DryRun: exits 0, prints the pending change, leaves the child branch list and status unchanged', () => {
    const fx = makeE2EFixture({});
    writeFile(fx.parentDir, 'shared/hello.txt', 'v2\n');
    git(fx.parentDir, ['add', '-A']);
    git(fx.parentDir, ['commit', '-q', '-m', 'update hello']);

    const beforeBranches = git(fx.childDir, ['branch', '--list']);
    const beforeStatus = git(fx.childDir, ['status', '--porcelain']);
    const r = runE2EWrapper(fx, ['-DryRun']);
    const afterBranches = git(fx.childDir, ['branch', '--list']);
    const afterStatus = git(fx.childDir, ['status', '--porcelain']);

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('update: shared/hello.txt');
    expect(afterBranches).toBe(beforeBranches);
    expect(afterStatus).toBe(beforeStatus);
  });

  it('an unreachable parent exits 2 with non-empty stderr and no sync PR opened line', () => {
    const fx = makeE2EFixture({});
    writeFile(
      fx.childDir,
      'repo-profile.json',
      JSON.stringify({
        governanceHome: 'https://sync.invalid/parent.git',
        syncIssue: fx.syncIssue,
        defaultBranch: 'trunk',
        ghPath: 'gh-stub-does-not-exist-on-path',
      })
    );
    const r = runE2EWrapper(fx);
    expect(r.status).toBe(2);
    expect(r.stderr.trim().length).toBeGreaterThan(0);
    expect(r.stdout).not.toContain('sync PR opened');
  });

  it('a corrupt parent manifest exits 2, non-empty stderr, no leftover worktree or temp directory', () => {
    const fx = makeE2EFixture({});
    // A bare sharedPaths entry naming a file the parent tree does not have:
    // corruption, per Resolve-SharedSet's fail-closed contract.
    writeFile(
      fx.parentDir,
      'governance-manifest.json',
      JSON.stringify({
        retired: [],
        sharedPaths: ['this-file-does-not-exist.txt'],
        excludedPaths: [],
      })
    );
    git(fx.parentDir, ['add', '-A']);
    git(fx.parentDir, ['commit', '-q', '-m', 'corrupt manifest']);

    const tmpBefore = new Set(
      fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('governance-sync-'))
    );
    const r = runE2EWrapper(fx);
    const tmpAfter = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('governance-sync-'));
    const leftover = tmpAfter.filter((n) => !tmpBefore.has(n));

    expect(r.status).toBe(2);
    expect(r.stderr.trim().length).toBeGreaterThan(0);
    const worktrees = git(fx.childDir, ['worktree', 'list']).trim().split('\n');
    expect(worktrees).toHaveLength(1);
    expect(leftover).toEqual([]);
  });
});
