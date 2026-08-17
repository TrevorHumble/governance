// tests/apply-branch-protection.test.js
// Vitest tests for apply-branch-protection.ps1, exercised via the -EmitPayload
// offline seam (no network call, no gh authentication needed).
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

const SCRIPT = path.join(__dirname, '..', 'tools', 'apply-branch-protection.ps1');

function run(extraArgs) {
  return spawnSync(
    PS,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-EmitPayload'].concat(
      extraArgs || []
    ),
    { encoding: 'utf8' }
  );
}

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, `${PS} not found, skipping apply-branch-protection tests`)
  : describe;

maybeDescribe('apply-branch-protection -EmitPayload', () => {
  // Required checks are parameterized (issue #1): no wedding-repo check names are
  // baked in. Passing -RequiredChecks explicitly makes the payload assertion
  // independent of whatever repo-profile.json happens to declare.
  it('-EmitPayload -RequiredChecks a,b,c -> exact contexts round-tripped, app_id -1, strict false, no "contexts" key', () => {
    const r = run(['-RequiredChecks', 'a,b,c']);
    expect(r.status).toBe(0);

    const body = JSON.parse(r.stdout);
    const checks = body.required_status_checks.checks;
    expect(checks).toHaveLength(3);

    const sortedContexts = checks.map((c) => c.context).sort();
    expect(sortedContexts).toEqual(['a', 'b', 'c']);

    for (const check of checks) {
      expect(check.app_id).toBe(-1);
    }

    expect(body.required_status_checks.strict).toBe(false);
    expect(r.stdout).not.toContain('"contexts"');
  });

  it('-EmitPayload with no -RequiredChecks falls back to repo-profile.json\'s ciCheckNames', () => {
    const r = run();
    expect(r.status).toBe(0);
    const body = JSON.parse(r.stdout);
    // This repo's own shipped profile declares exactly one check name: "build".
    expect(body.required_status_checks.checks.map((c) => c.context)).toEqual(['build']);
  });

  it('-EmitPayload -> required_approving_review_count 0, enforce_admins true, restrictions null', () => {
    const r = run(['-RequiredChecks', 'build']);
    expect(r.status).toBe(0);

    const body = JSON.parse(r.stdout);
    expect(body.required_pull_request_reviews.required_approving_review_count).toBe(0);
    expect(body.enforce_admins).toBe(true);
    expect(r.stdout).toMatch(/"restrictions"\s*:\s*null/);
  });

  // The payload is stable across repeated invocations with the same inputs: no
  // hidden state, so two runs must emit byte-identical checks.
  it('-EmitPayload is idempotent: two runs with the same -RequiredChecks emit the same checks', () => {
    const first = run(['-RequiredChecks', 'x,y']);
    const second = run(['-RequiredChecks', 'x,y']);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(JSON.parse(first.stdout)).toEqual(JSON.parse(second.stdout));
  });
});
