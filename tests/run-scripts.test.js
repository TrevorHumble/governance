// tests/run-scripts.test.js
// Vitest tests for tools/start-run.ps1, tools/ship.ps1 and scripts/check-buildlog-entry.js. Each
// case builds a bare "origin" and a clone that carries this repo's tools/, the buildlog CLI and
// PIPELINE.md, and points GH_PATH at a fake gh that logs its arguments and answers from env vars.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const ROOT = path.join(__dirname, '..');

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${r.stderr}`);
  return r.stdout;
}

function write(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

// The fake gh. Every call is logged as one line of its arguments. Answers:
//   issues POST -> STUB_ISSUE (default 501); pulls?...state=open -> STUB_OPEN_PR or nothing;
//   pulls?...state=closed -> STUB_MERGED_PR or nothing; pulls POST -> 77;
//   check-runs -> STUB_CHECKS, one tab-separated line per run: name, status, conclusion, url
//   (default: build, completed, success); STUB_CHECKS_FIRST, when set, answers the first call only;
//   each argument of the latest check-runs call goes on its own line in gh-checkargs.txt;
//   commits/<sha>/status -> STUB_STATUSES or nothing, one line per status: context, state, url;
//   pulls/<n> head sha -> STUB_HEAD_SHA, else the local HEAD; anything else -> ok.
function makeGh(dir) {
  const stub = path.join(dir, 'gh-stub.ps1');
  const log = path.join(dir, 'gh-log.txt').replace(/'/g, "''");
  const count = path.join(dir, 'gh-checks-count.txt').replace(/'/g, "''");
  const checkArgs = path.join(dir, 'gh-checkargs.txt').replace(/'/g, "''");
  fs.writeFileSync(
    stub,
    [
      '$a = $args',
      `Add-Content -LiteralPath '${log}' -Value ($a -join ' ')`,
      '$all = $a -join " "',
      "if ($all -match '^api repos/\\{owner\\}/\\{repo\\}/pulls/\\d+ --jq') { if ($env:STUB_HEAD_SHA) { Write-Output $env:STUB_HEAD_SHA } else { git rev-parse HEAD }; exit 0 }",
      `if ($all -match 'check-runs') { Set-Content -LiteralPath '${checkArgs}' -Value $a; $n = 0; if (Test-Path -LiteralPath '${count}') { $n = [int](Get-Content -LiteralPath '${count}') }; Set-Content -LiteralPath '${count}' -Value ($n + 1); if ($n -eq 0 -and $env:STUB_CHECKS_FIRST) { Write-Output $env:STUB_CHECKS_FIRST } elseif ($env:STUB_CHECKS) { Write-Output $env:STUB_CHECKS } else { Write-Output "build\`tcompleted\`tsuccess\`thttps://ci/1" }; exit 0 }`,
      "if ($all -match '/commits/\\w+/status') { if ($env:STUB_STATUSES) { Write-Output $env:STUB_STATUSES }; exit 0 }",
      "if ($all -match 'pulls\\?head=.*state=open') { if ($env:STUB_OPEN_PR) { Write-Output $env:STUB_OPEN_PR }; exit 0 }",
      "if ($all -match 'pulls\\?head=.*state=closed') { if ($env:STUB_MERGED_PR) { Write-Output $env:STUB_MERGED_PR }; exit 0 }",
      "if ($all -match '^api repos/\\{owner\\}/\\{repo\\}/pulls -f head=') { Write-Output '77'; exit 0 }",
      "if ($all -match '^api repos/\\{owner\\}/\\{repo\\}/issues -f title=') { if ($env:STUB_ISSUE) { Write-Output $env:STUB_ISSUE } else { Write-Output '501' }; exit 0 }",
      'exit 0',
    ].join('\n')
  );
  return stub;
}

function makeRepo(profile = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-scripts-'));
  const origin = path.join(root, 'origin.git');
  const clone = path.join(root, 'clone');
  git(root, ['init', '--bare', '-b', 'main', origin]);
  git(root, ['clone', '-q', origin, clone]);
  git(clone, ['config', 'user.email', 't@example.invalid']);
  git(clone, ['config', 'user.name', 'T']);
  git(clone, ['config', 'core.autocrlf', 'false']);
  fs.mkdirSync(path.join(clone, 'tools'));
  for (const f of fs.readdirSync(path.join(ROOT, 'tools'))) {
    fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(clone, 'tools', f));
  }
  for (const f of [
    'scripts/check-buildlog-entry.js',
    'scripts/buildlog-glue-core.js',
    'pipeline/PIPELINE.md',
  ]) {
    write(clone, f, fs.readFileSync(path.join(ROOT, f)));
  }
  write(
    clone,
    'repo-profile.json',
    JSON.stringify({ defaultBranch: 'main', governanceHome: 'self', ...profile })
  );
  write(clone, '.gitignore', '.run_state/\n');
  git(clone, ['add', '-A']);
  git(clone, ['commit', '-q', '-m', 'seed']);
  git(clone, ['push', '-q', 'origin', 'main']);
  return { root, origin, clone, gh: makeGh(root), log: path.join(root, 'gh-log.txt') };
}

function run(repo, cwd, script, args, env = {}, root = cwd) {
  const r = spawnSync(
    PS,
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(root, 'tools', script),
      ...args,
    ],
    {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GH_PATH: repo.gh, SHIP_POLL_SECONDS: '0', ...env },
    }
  );
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const ghLog = (repo) => (fs.existsSync(repo.log) ? fs.readFileSync(repo.log, 'utf8') : '');

describe.skipIf(launcherMissing)(launcherMissing ? skipTitle('run-scripts') : 'start-run', () => {
  it('with a backlog issue, makes the worktree, run note, session name and to-do list', () => {
    const repo = makeRepo();
    const r = run(repo, repo.clone, 'start-run.ps1', ['-Goal', 'Start And Ship', '-Issue', '42']);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('session name: 42 start and ship');
    const wt = path.join(repo.root, 'clone-42-start-and-ship');
    expect(fs.existsSync(path.join(wt, 'tools', 'ship.ps1'))).toBe(true);
    expect(git(wt, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()).toBe('42-start-and-ship');
    const note = fs.readFileSync(path.join(repo.clone, '.run_state', '42.md'), 'utf8');
    expect(note).toContain('## Decisions');
    expect(r.out).toMatch(/to-do:[\s\S]*1\. Isolate[\s\S]*12\. Report/);
    expect(ghLog(repo)).toBe('');
  });

  it('with no issue, files a placeholder with needs-issue-review and uses its number', () => {
    const repo = makeRepo();
    const r = run(repo, repo.clone, 'start-run.ps1', ['-Goal', 'make a thing']);
    expect(r.code, r.err).toBe(0);
    expect(ghLog(repo)).toMatch(/issues -f title=make a thing .*labels\[\]=needs-issue-review/);
    expect(ghLog(repo)).not.toContain('owner-approved');
    expect(r.out).toContain('session name: 501 make a thing');
    expect(fs.existsSync(path.join(repo.clone, '.run_state', '501.md'))).toBe(true);
  });

  it('reuses the worktree on a second run and keeps the run note', () => {
    const repo = makeRepo();
    expect(run(repo, repo.clone, 'start-run.ps1', ['-Goal', 'again', '-Issue', '7']).code).toBe(0);
    fs.appendFileSync(path.join(repo.clone, '.run_state', '7.md'), 'kept line\n');
    const r = run(repo, repo.clone, 'start-run.ps1', ['-Goal', 'again', '-Issue', '7']);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('(reused)');
    expect(fs.readFileSync(path.join(repo.clone, '.run_state', '7.md'), 'utf8')).toContain(
      'kept line'
    );
  });

  it('stops when the worktree is behind the default branch', () => {
    const repo = makeRepo();
    expect(run(repo, repo.clone, 'start-run.ps1', ['-Goal', 'behind', '-Issue', '8']).code).toBe(0);
    write(repo.clone, 'later.txt', 'x');
    git(repo.clone, ['add', '-A']);
    git(repo.clone, ['commit', '-q', '-m', 'later']);
    git(repo.clone, ['push', '-q', 'origin', 'main']);
    const r = run(repo, repo.clone, 'start-run.ps1', ['-Goal', 'behind', '-Issue', '8']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('commits behind');
    expect(r.err).toContain('not current');
  });

  it('the lane files no issue and writes no run note', () => {
    const repo = makeRepo();
    const r = run(repo, repo.clone, 'start-run.ps1', ['-Goal', 'opus to fable', '-Lane']);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('session name: opus to fable');
    expect(fs.existsSync(path.join(repo.root, 'clone-lane-opus-to-fable'))).toBe(true);
    expect(fs.existsSync(path.join(repo.clone, '.run_state'))).toBe(false);
    expect(ghLog(repo)).toBe('');
  });

  it('after filing a placeholder, a stop says to run again with -Issue', () => {
    const repo = makeRepo();
    fs.mkdirSync(path.join(repo.root, 'clone-501-blocked'));
    const r = run(repo, repo.clone, 'start-run.ps1', ['-Goal', 'blocked']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('Run again with -Issue 501');
  });

  it('refuses an empty goal and a bad issue number without filing anything', () => {
    const repo = makeRepo();
    expect(run(repo, repo.clone, 'start-run.ps1', ['-Goal', '   ']).code).toBe(1);
    expect(run(repo, repo.clone, 'start-run.ps1', ['-Goal', 'x', '-Issue', '0']).code).toBe(1);
    expect(run(repo, repo.clone, 'start-run.ps1', ['-Goal', '!!!', '-Issue', '3']).code).toBe(1);
    expect(run(repo, repo.clone, 'start-run.ps1', ['-Goal', 'a "quoted" goal']).code).toBe(1);
    expect(
      run(repo, repo.clone, 'start-run.ps1', ['-Goal', 'x', '-Lane', '-Issue', '4']).code
    ).toBe(1);
    expect(ghLog(repo)).toBe('');
  });
});

const ENTRY =
  'Steps 01, 02 and 11 now run as two scripts, so a run spends fewer tokens and cannot skip the buildlog fragment. Review found two plan gaps, both fixed; CI is expected green.';

// A clone on branch 42-x with one committed change and a run note.
function shipRepo(decisions = 'Changed the thing.\n- Kept the old name.', profile) {
  const repo = makeRepo(profile);
  git(repo.clone, ['checkout', '-q', '-b', '42-x']);
  write(repo.clone, 'change.txt', 'new');
  git(repo.clone, ['add', '-A']);
  git(repo.clone, ['commit', '-q', '-m', 'Change (#42)']);
  write(repo.clone, '.run_state/42.md', `# 42 x\n\nStep: 11.\n\n## Decisions\n\n${decisions}\n`);
  return repo;
}

const SHIP = ['-Issue', '42', '-Title', 'Start and ship scripts', '-Entry', ENTRY];

describe.skipIf(launcherMissing)(launcherMissing ? skipTitle('run-scripts') : 'ship', () => {
  it('opens the PR with the decisions, adds a checked fragment, merges on green and closes the issue', () => {
    const repo = shipRepo();
    const r = run(repo, repo.clone, 'ship.ps1', SHIP);
    expect(r.code, r.err).toBe(0);
    const log = ghLog(repo);
    expect(log).toMatch(/pulls -f head=42-x -f base=main -f title=Start and ship scripts/);
    const head = git(repo.clone, ['rev-parse', 'HEAD']).trim();
    expect(log).toContain(`pulls/77/merge -f merge_method=squash -f sha=${head}`);
    expect(log).toMatch(/-X PATCH repos\/\{owner\}\/\{repo\}\/issues\/42 -f state=closed/);
    const frag = fs.readFileSync(path.join(repo.clone, 'buildlog', '42-77.md'), 'utf8');
    expect(frag).toMatch(/^- \d{4}-\d{2}-\d{2} - #42 Start and ship scripts \(PR #77\)\. Steps/);
    expect(git(repo.origin, ['log', '--format=%s', '42-x'])).toContain('Buildlog fragment for #42');
  });

  it('stops on red CI, names the check, and merges nothing', () => {
    const repo = shipRepo();
    const r = run(repo, repo.clone, 'ship.ps1', SHIP, {
      STUB_CHECKS: 'build\tcompleted\tfailure\thttps://ci/9',
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain('failure');
    expect(r.err).toContain('https://ci/9');
    expect(ghLog(repo)).not.toContain('/merge');
    expect(ghLog(repo)).not.toMatch(/issues\/\d+ -f state=closed/);
  });

  const BUILD_GREEN = 'build\tcompleted\tsuccess\thttps://ci/1';

  it('waits for every check in ciCheckNames, and merges only after the last one is green', () => {
    const repo = shipRepo(undefined, { ciCheckNames: ['build', 'core'] });
    const r = run(repo, repo.clone, 'ship.ps1', SHIP, {
      STUB_CHECKS_FIRST: `${BUILD_GREEN}\ncore\tin_progress\t\thttps://ci/2`,
      STUB_CHECKS: `${BUILD_GREEN}\ncore\tcompleted\tsuccess\thttps://ci/2`,
    });
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('waiting for build, core');
    const calls = ghLog(repo).split('\n');
    const merge = calls.findIndex((l) => l.includes('/merge'));
    expect(merge).toBeGreaterThan(-1);
    expect(calls.slice(0, merge).filter((l) => l.includes('check-runs')).length).toBe(2);
  });

  it('a required check with no run yet counts as still waiting', () => {
    const repo = shipRepo(undefined, { ciCheckNames: ['build', 'core'] });
    const r = run(repo, repo.clone, 'ship.ps1', SHIP, {
      STUB_CHECKS_FIRST: BUILD_GREEN,
      STUB_CHECKS: `${BUILD_GREEN}\ncore\tcompleted\tsuccess\thttps://ci/2`,
    });
    expect(r.code, r.err).toBe(0);
    const calls = ghLog(repo).split('\n');
    const merge = calls.findIndex((l) => l.includes('/merge'));
    expect(merge).toBeGreaterThan(-1);
    expect(calls.slice(0, merge).filter((l) => l.includes('check-runs')).length).toBe(2);
  });

  it('stops on a red required check other than build, names it, and merges nothing', () => {
    const repo = shipRepo(undefined, { ciCheckNames: ['build', 'core'] });
    const r = run(repo, repo.clone, 'ship.ps1', SHIP, {
      STUB_CHECKS: `${BUILD_GREEN}\ncore\tcompleted\tfailure\thttps://ci/7`,
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain('the core check finished failure');
    expect(r.err).toContain('https://ci/7');
    expect(ghLog(repo)).not.toContain('/merge');
  });

  // The fake gh is a PowerShell script, so a call to it never goes through native argument
  // passing and 5.1 never splits it here. Asserting the filter's shape catches it under either shell.
  it('reads checks with a --jq filter Windows PowerShell 5.1 passes to gh whole', () => {
    const repo = shipRepo();
    const r = run(repo, repo.clone, 'ship.ps1', SHIP);
    expect(r.code, r.err).toBe(0);
    const file = path.join(repo.root, 'gh-checkargs.txt');
    const argv = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    expect(argv).toHaveLength(4);
    expect(argv[0]).toBe('api');
    expect(argv[1]).toMatch(/\/check-runs/);
    expect(argv[2]).toBe('--jq');
    expect(argv[3]).not.toMatch(/["\s]/);
  });

  it('a skipped or neutral required check counts as green', () => {
    const repo = shipRepo(undefined, { ciCheckNames: ['build', 'core', 'lint'] });
    const r = run(repo, repo.clone, 'ship.ps1', SHIP, {
      STUB_CHECKS: [
        BUILD_GREEN,
        'core\tcompleted\tskipped\thttps://ci/2',
        'lint\tcompleted\tneutral\thttps://ci/3',
      ].join('\n'),
    });
    expect(r.code, r.err).toBe(0);
    expect(ghLog(repo)).toContain('/merge');
  });

  it('a required check reported as a commit status is waited on, then counted', () => {
    const profile = { ciCheckNames: ['build', 'deploy-preview'] };
    const pending = shipRepo(undefined, profile);
    const r = run(pending, pending.clone, 'ship.ps1', [...SHIP, '-TimeoutMinutes', '0'], {
      STUB_STATUSES: 'deploy-preview\tpending\thttps://ci/4',
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain('not green after 0 minutes: deploy-preview');
    expect(ghLog(pending)).not.toContain('/merge');

    const red = shipRepo(undefined, profile);
    const f = run(red, red.clone, 'ship.ps1', SHIP, {
      STUB_STATUSES: 'deploy-preview\terror\thttps://ci/5',
    });
    expect(f.code).toBe(1);
    expect(f.err).toContain('the deploy-preview check finished error');
    expect(f.err).toContain('https://ci/5');
    expect(ghLog(red)).not.toContain('/merge');

    const green = shipRepo(undefined, profile);
    const g = run(green, green.clone, 'ship.ps1', SHIP, {
      STUB_STATUSES: 'deploy-preview\tsuccess\thttps://ci/6',
    });
    expect(g.code, g.err).toBe(0);
    expect(ghLog(green)).toContain('/merge');
  });

  it('a red check that is not in ciCheckNames does not stop the merge', () => {
    const repo = shipRepo();
    const r = run(repo, repo.clone, 'ship.ps1', SHIP, {
      STUB_CHECKS: `${BUILD_GREEN}\nextra\tcompleted\tfailure\thttps://ci/8`,
    });
    expect(r.code, r.err).toBe(0);
    expect(ghLog(repo)).toContain('/merge');
  });

  it('a re-run after red reuses the open PR and the fragment', () => {
    const repo = shipRepo();
    run(repo, repo.clone, 'ship.ps1', SHIP, {
      STUB_CHECKS: 'build\tcompleted\tfailure\thttps://ci/9',
    });
    const r = run(repo, repo.clone, 'ship.ps1', SHIP, { STUB_OPEN_PR: '77' });
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('already open');
    expect(r.out).toContain('already there');
  });

  it('merges nothing when the PR head is not the commit this worktree checked', () => {
    const repo = shipRepo();
    const r = run(repo, repo.clone, 'ship.ps1', SHIP, { STUB_HEAD_SHA: 'deadbeef' });
    expect(r.code).toBe(1);
    expect(r.err).toContain('deadbeef');
    expect(ghLog(repo)).not.toContain('/merge');
    const m = run(repo, repo.clone, 'ship.ps1', ['-Lane', '-Merge'], {
      STUB_OPEN_PR: '77',
      STUB_HEAD_SHA: 'deadbeef',
    });
    expect(m.code).toBe(1);
    expect(ghLog(repo)).not.toContain('/merge');
  });

  it('stops before pushing when the branch is behind the default branch', () => {
    const repo = shipRepo();
    git(repo.clone, ['checkout', '-q', 'main']);
    write(repo.clone, 'later.txt', 'x');
    git(repo.clone, ['add', '-A']);
    git(repo.clone, ['commit', '-q', '-m', 'later']);
    git(repo.clone, ['push', '-q', 'origin', 'main']);
    git(repo.clone, ['checkout', '-q', '42-x']);
    const r = run(repo, repo.clone, 'ship.ps1', SHIP);
    expect(r.code).toBe(1);
    expect(r.err).toContain('commits behind');
    expect(git(repo.origin, ['branch', '--list', '42-x']).trim()).toBe('');
  });

  it('a re-run after the merge only closes the issue, even with main ahead', () => {
    const repo = shipRepo();
    git(repo.clone, ['checkout', '-q', 'main']);
    write(repo.clone, 'change.txt', 'merged');
    git(repo.clone, ['add', '-A']);
    git(repo.clone, ['commit', '-q', '-m', 'squash of 42-x']);
    git(repo.clone, ['push', '-q', 'origin', 'main']);
    git(repo.clone, ['checkout', '-q', '42-x']);
    const r = run(repo, repo.clone, 'ship.ps1', SHIP, { STUB_MERGED_PR: '77' });
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('already shipped');
    expect(ghLog(repo)).toMatch(/issues\/42 -f state=closed/);
    expect(ghLog(repo)).not.toContain('/merge');
  });

  it('writes the fragment in the repo root when run from a subfolder', () => {
    const repo = shipRepo();
    const r = run(repo, path.join(repo.clone, 'tools'), 'ship.ps1', SHIP, {}, repo.clone);
    expect(r.code, r.err).toBe(0);
    expect(fs.existsSync(path.join(repo.clone, 'buildlog', '42-77.md'))).toBe(true);
    expect(fs.existsSync(path.join(repo.clone, 'tools', 'buildlog'))).toBe(false);
  });

  it('refuses an empty Decisions section before pushing anything', () => {
    const repo = shipRepo('');
    const r = run(repo, repo.clone, 'ship.ps1', SHIP);
    expect(r.code).toBe(1);
    expect(r.err).toContain('Decisions');
    expect(git(repo.origin, ['branch', '--list', '42-x']).trim()).toBe('');
  });

  it('stops on a question to the owner with no answer, before pushing anything', () => {
    const repo = shipRepo('Changed the thing.\n- Asked: should the tooltip say Editable?');
    const r = run(repo, repo.clone, 'ship.ps1', SHIP);
    expect(r.code).toBe(1);
    expect(r.err).toContain('Asked: should the tooltip say Editable?');
    expect(r.err).toContain('Nothing was merged');
    expect(git(repo.origin, ['branch', '--list', '42-x']).trim()).toBe('');
  });

  it('treats an empty answer as no answer', () => {
    const repo = shipRepo(
      'Changed the thing.\n- Asked: should the tooltip say Editable? Answer:  '
    );
    const r = run(repo, repo.clone, 'ship.ps1', SHIP);
    expect(r.code).toBe(1);
    expect(r.err).toContain('no answer');
  });

  it('ships once the question carries his answer', () => {
    const repo = shipRepo(
      'Changed the thing.\n- Asked: should the tooltip say Editable? Answer: yes, keep it short'
    );
    const r = run(repo, repo.clone, 'ship.ps1', SHIP);
    expect(r.code, r.err).toBe(0);
    expect(ghLog(repo)).toContain('pulls/77/merge');
  });

  it('refuses a stub entry, removes the fragment, and merges nothing', () => {
    const repo = shipRepo();
    const r = run(repo, repo.clone, 'ship.ps1', [
      '-Issue',
      '42',
      '-Title',
      'T',
      '-Entry',
      'too short',
    ]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('stub');
    expect(fs.existsSync(path.join(repo.clone, 'buildlog', '42-77.md'))).toBe(false);
    expect(ghLog(repo)).not.toContain('/merge');
  });

  it('refuses uncommitted changes', () => {
    const repo = shipRepo();
    write(repo.clone, 'loose.txt', 'x');
    const r = run(repo, repo.clone, 'ship.ps1', SHIP);
    expect(r.code).toBe(1);
    expect(r.err).toContain('uncommitted');
  });

  it('the lane stops at green with no fragment, merge or close; -Lane -Merge then merges and closes nothing', () => {
    const repo = shipRepo('');
    const r = run(repo, repo.clone, 'ship.ps1', [
      '-Lane',
      '-Issue',
      '111',
      '-Body',
      'check:seats: ok',
    ]);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('-Lane -Merge');
    expect(fs.existsSync(path.join(repo.clone, 'buildlog'))).toBe(false);
    expect(ghLog(repo)).not.toContain('/merge');
    const m = run(repo, repo.clone, 'ship.ps1', ['-Lane', '-Merge'], { STUB_OPEN_PR: '77' });
    expect(m.code, m.err).toBe(0);
    expect(ghLog(repo)).toContain('pulls/77/merge');
    expect(ghLog(repo)).not.toMatch(/issues\/\d+ -f state=closed/);
  });

  it('refuses -Merge without -Lane, and shipMode direct', () => {
    const repo = shipRepo();
    expect(run(repo, repo.clone, 'ship.ps1', [...SHIP, '-Merge']).err).toContain(
      'only for the configuration lane'
    );
    const direct = shipRepo(undefined, { shipMode: 'direct' });
    const r = run(direct, direct.clone, 'ship.ps1', SHIP);
    expect(r.code).toBe(1);
    expect(r.err).toContain('11-ship.md');
  });
});

describe('check-buildlog-entry', () => {
  const { check } = require('../scripts/check-buildlog-entry');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-'));
  const at = (name, text) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, text);
    return f;
  };

  it('passes a full entry', () => {
    expect(check(at('42-77.md', `- 2026-11-15 - #42 Scripts (PR #77). ${ENTRY}\n`)).code).toBe(0);
  });

  it('refuses a stub, a number mismatch, a bad name and a missing file', () => {
    expect(
      check(at('42-78.md', '- 2026-11-15 - #42 Scripts (PR #78). Short.\n')).message
    ).toContain('stub');
    expect(
      check(at('43-79.md', `- 2026-11-15 - #42 Scripts (PR #79). ${ENTRY}\n`)).message
    ).toContain('number-mismatch');
    expect(
      check(at('notes.md', `- 2026-11-15 - #42 Scripts (PR #80). ${ENTRY}\n`)).message
    ).toContain('filename');
    expect(check(path.join(dir, 'gone.md')).code).toBe(1);
  });
});
