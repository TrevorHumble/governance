// tests/classify-dep-pr.test.js
// Vitest tests for classify-dep-pr.ps1: tier logic and the critical-dependency-list
// mechanism (env override and repo-profile.json, including this repo's own empty list).
// Windows PowerShell 5.1 is the launcher on win32; pwsh on other platforms.
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

const PS = process.platform === 'win32' ? 'powershell' : 'pwsh';

// One-time guard: if the launcher doesn't exist, skip all tests.
let launcherMissing = false;
try {
  execFileSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'exit 0']);
} catch (e) {
  if (e.code === 'ENOENT') {
    launcherMissing = true;
  }
}

const SCRIPT = path.join(__dirname, '..', 'tools', 'classify-dep-pr.ps1');

function run(ecosystem, depName, semverBump, depType, criticalDepsJson) {
  const env = Object.assign({}, process.env);
  if (criticalDepsJson !== undefined) {
    env.CRITICAL_DEPS_JSON = criticalDepsJson;
  } else {
    delete env.CRITICAL_DEPS_JSON;
  }
  return spawnSync(
    PS,
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      SCRIPT,
      '-Ecosystem',
      ecosystem,
      '-DepName',
      depName,
      '-SemverBump',
      semverBump,
      '-DepType',
      depType,
    ],
    { encoding: 'utf8', env }
  );
}

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, `${PS} not found, skipping classify-dep-pr tests`)
  : describe;

maybeDescribe('classify-dep-pr', () => {
  // github-actions bumps are always auto, regardless of semver or dep type.
  it('github-actions / actions/checkout / major / prod -> auto, exit 0', () => {
    const r = run('github-actions', 'actions/checkout', 'major', 'prod', '[]');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('auto');
  });

  // dev bumps are always auto (CI catches a broken build tool), even for a
  // name that also appears on the critical list.
  it('npm / eslint / major / dev -> auto, exit 0', () => {
    const r = run('npm', 'eslint', 'major', 'dev', '["eslint"]');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('auto');
  });

  // non-critical prod patch is safe to auto-merge.
  it('npm / lodash / patch / prod -> auto, exit 0', () => {
    const r = run('npm', 'lodash', 'patch', 'prod', '[]');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('auto');
  });

  // Mutation-coverage: non-critical prod MAJOR is held (isolates the major branch
  // independently: a critical-list dep would short-circuit at the critical check
  // and never reach this branch).
  it('npm / express / major / prod -> review', () => {
    const r = run('npm', 'express', 'major', 'prod', '[]');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('review');
  });

  // Mutation-coverage: dev precedence beats the critical-list check: a mutant
  // that reordered critical-before-dev would pass the other tests but fail here.
  it('npm / some-critical-pkg / major / dev -> auto', () => {
    const r = run('npm', 'some-critical-pkg', 'major', 'dev', '["some-critical-pkg"]');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('auto');
  });
});

// The critical-dependency-list mechanism (issue #1): the list is supplied per repo,
// via CRITICAL_DEPS_JSON (the test seam) or repo-profile.json, never hardcoded in the
// script. Proves the tier logic honors a profile-supplied list, including the empty
// list this repo declares.
describe('critical-dependency-list mechanism', () => {
  it('a name on a supplied critical list is held even on patch (CRITICAL_DEPS_JSON override)', () => {
    const r = run('npm', 'some-native-binary-dep', 'patch', 'prod', '["some-native-binary-dep"]');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('review');
  });

  it('a name on a supplied critical list is held even on minor (CRITICAL_DEPS_JSON override)', () => {
    const r = run('npm', 'some-db-driver', 'minor', 'prod', '["some-db-driver","some-image-lib"]');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('review');
  });

  it('a name NOT on the supplied critical list is auto on minor', () => {
    const r = run('npm', 'left-pad', 'minor', 'prod', '["some-db-driver"]');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('auto');
  });

  // This repo's own shipped repo-profile.json declares an empty criticalDependencies
  // list. With no env override, a name that WOULD be held under a non-empty list
  // (e.g. a native-binary dependency) classifies auto here, proving the empty-list
  // case works, not just the non-empty case.
  it("this repo's shipped repo-profile.json declares an empty critical list: falls through to auto on prod minor with no override", () => {
    const r = run('npm', 'some-native-binary-dep', 'minor', 'prod', undefined);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('auto');
  });
});
