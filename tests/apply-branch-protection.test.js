// tests/apply-branch-protection.test.js
// Vitest tests for apply-branch-protection.ps1, exercised via the -EmitPayload
// offline seam (no network call, no gh authentication needed).
// Launcher resolution is shared: see tests/ps-launcher.js.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const SCRIPT = path.join(__dirname, '..', 'tools', 'apply-branch-protection.ps1');
const BASE_ARGS = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT];

function run(extraArgs) {
  return spawnSync(PS, BASE_ARGS.concat(['-EmitPayload']).concat(extraArgs || []), {
    encoding: 'utf8',
  });
}

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('apply-branch-protection'))
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

  it("-EmitPayload with no -RequiredChecks falls back to repo-profile.json's ciCheckNames", () => {
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

  // Issue #17: the actual defect was a UTF-8 byte-order-mark in front of the
  // payload, which GitHub's JSON parser rejects. -PayloadPath writes the same
  // payload the PUT sends (both go through Write-PayloadFile), so reading the
  // written bytes back is a direct test of what the PUT would put on the wire.
  it('-EmitPayload -PayloadPath <file> writes a BOM-free file starting with "{"', () => {
    const tmpPath = path.join(
      os.tmpdir(),
      `apply-branch-protection-test-${process.pid}-${Date.now()}.json`
    );
    try {
      const r = run(['-RequiredChecks', 'build', '-PayloadPath', tmpPath]);
      expect(r.status).toBe(0);

      const bytes = fs.readFileSync(tmpPath);
      expect(bytes.slice(0, 3)).not.toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
      expect(String.fromCharCode(bytes[0])).toBe('{');

      const parsed = JSON.parse(bytes.toString('utf8'));
      expect(parsed.required_status_checks.checks.map((c) => c.context)).toEqual(['build']);
    } finally {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  });

  // A relative path must anchor to (Get-Location), not the .NET process's
  // working directory, which is why the two directories below are deliberately distinct.
  // See issue #17 for the measurement.
  it('-EmitPayload -PayloadPath <relative> resolves against PowerShell current location, not process cwd', () => {
    const spawnCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-branch-protection-spawncwd-'));
    const locationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-branch-protection-setloc-'));
    const relName = `apply-branch-protection-test-rel-${process.pid}-${Date.now()}.json`;
    const wrongPath = path.join(spawnCwd, relName);
    const rightPath = path.join(locationDir, relName);
    try {
      // -Command, not -File: -File cannot run a Set-Location before the
      // script, and that Set-Location is what makes (Get-Location) diverge
      // from the process cwd.
      const psQuote = (s) => s.replace(/'/g, "''");
      const command =
        `Set-Location -LiteralPath '${psQuote(locationDir)}'; ` +
        `& '${psQuote(SCRIPT)}' -EmitPayload -RequiredChecks build -PayloadPath '${psQuote(relName)}'`;
      const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
        encoding: 'utf8',
        cwd: spawnCwd,
      });
      expect(r.status).toBe(0);
      expect(fs.existsSync(rightPath)).toBe(true);
      expect(fs.existsSync(wrongPath)).toBe(false);

      const parsed = JSON.parse(fs.readFileSync(rightPath, 'utf8'));
      expect(parsed.required_status_checks.checks.map((c) => c.context)).toEqual(['build']);
    } finally {
      fs.rmSync(spawnCwd, { recursive: true, force: true });
      fs.rmSync(locationDir, { recursive: true, force: true });
    }
  });

  // -PayloadPath without -EmitPayload must fail loudly rather than fall
  // through to a live PUT while the caller expects an offline dry run.
  it('-PayloadPath without -EmitPayload exits non-zero and touches no file', () => {
    const tmpPath = path.join(
      os.tmpdir(),
      `apply-branch-protection-test-noflag-${process.pid}-${Date.now()}.json`
    );
    const r = spawnSync(PS, BASE_ARGS.concat(['-PayloadPath', tmpPath]), { encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('-PayloadPath requires -EmitPayload');
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  // An explicitly empty -PayloadPath is still a caller mistake even without
  // -EmitPayload: the guard must use ContainsKey, not truthiness, or an empty
  // string sails past it toward the network path.
  it("-PayloadPath '' without -EmitPayload exits non-zero via the same guard", () => {
    const r = spawnSync(PS, BASE_ARGS.concat(['-PayloadPath', '']), { encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('-PayloadPath requires -EmitPayload');
  });

  // Sibling of the guard above: with -EmitPayload present, an explicitly
  // empty -PayloadPath must still fail, via the separate non-empty-path check.
  it("-EmitPayload -PayloadPath '' exits non-zero via the non-empty-path guard", () => {
    const r = run(['-PayloadPath', '']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('requires a non-empty path');
  });

  // Comment lines are stripped first so the source can carry its own trap
  // comment naming Set-Content without tripping this assertion.
  it('source has exactly one WriteAllText call and no Set-Content, outside comments', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8');
    const codeOnly = source
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');

    const writeAllTextMatches = codeOnly.match(/WriteAllText/g) || [];
    expect(writeAllTextMatches).toHaveLength(1);
    expect(codeOnly).not.toContain('Set-Content');
  });
});
