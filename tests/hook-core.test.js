// tests/hook-core.test.js
// Tests for .claude/hooks/hook-core.ps1, the logic every hook shares: Fill, Get-Family, Get-Note,
// Get-RoleTag, Get-ProjectRoot, Get-ReviewerRoles, Get-HardAwards, Read-Seats.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const CORE = path.join(__dirname, '..', '.claude', 'hooks', 'hook-core.ps1');

// Dot-sources the core and runs a PowerShell expression that returns a value; the value comes back as JSON.
function ps(expression, env = {}) {
  const script = `. '${CORE}'; ConvertTo-Json -Compress -Depth 5 $(${expression})`;
  const childEnv = { ...process.env, ...env };
  for (const k of Object.keys(childEnv)) if (childEnv[k] === undefined) delete childEnv[k];
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf8',
    env: childEnv,
  });
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout.trim());
}

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('hook-core'))
  : describe;

maybeDescribe('.claude/hooks/hook-core.ps1: Fill', () => {
  it('fills each {key} once, in a single pass', () => {
    expect(ps(`Fill 'a {x} b {y}' @{ x = '1'; y = '2' }`)).toBe('a 1 b 2');
  });

  it('does not fill a placeholder that a value brought in', () => {
    expect(ps(`Fill 'is {why}; {label}' @{ why = 'x {label}'; label = 'L' }`)).toBe(
      'is x {label}; L'
    );
  });

  it('leaves an unknown key as written', () => {
    expect(ps(`Fill 'a {nope} b' @{ x = '1' }`)).toBe('a {nope} b');
  });
});

maybeDescribe('.claude/hooks/hook-core.ps1: Get-Family', () => {
  it.each([
    ['claude-sonnet-5-5', 'sonnet'],
    ['claude-opus-5-5[1m]', 'opus'],
    ['us.anthropic.claude-sonnet-5-5-v1:0', 'sonnet'],
    ['anthropic.claude-fable-5-1', 'fable'],
    ['Claude-Opus-5-5', 'opus'],
    ['sonnet', 'sonnet'],
    ['Opus[1m]', 'opus'],
  ])('%s gives %s', (id, family) => {
    expect(ps(`Get-Family '${id}'`)).toBe(family);
  });

  it('gives null for a value that is not a string', () => {
    expect(ps('Get-Family $null')).toBeNull();
  });
});

maybeDescribe('.claude/hooks/hook-core.ps1: notes, tags, seats, root', () => {
  it('reads a section as one line, and a key from it', () => {
    expect(ps(`Get-Note 'goal-check'`)).toContain('standards/deciding.md');
    expect(ps(`Get-Note 'spawn-check' 'foreground'`)).toContain('run_in_background false');
    expect(ps(`Get-Note 'spawn-check' 'no-such-key'`)).toBeNull();
    expect(ps(`Get-Note 'no-such-hook'`)).toBeNull();
  });

  it('reads the role tag at the start of a description', () => {
    expect(ps(`Get-RoleTag '[code-reviewer] x'`)).toEqual({ Role: 'code-reviewer', Hard: false });
    expect(ps(`Get-RoleTag '  [orchestrator hard] x'`)).toEqual({
      Role: 'orchestrator',
      Hard: true,
    });
    for (const d of ["'x [referee]'", "'[Referee] x'", "'[] x'", "'[referee  soft] x'", '$null']) {
      expect(ps(`Get-RoleTag ${d}`)).toBeNull();
    }
  });

  it('resolves the project root from the environment, then the input cwd', () => {
    expect(
      ps(`Get-ProjectRoot ([pscustomobject]@{ cwd = '/from/cwd' })`, {
        CLAUDE_PROJECT_DIR: '/from/env',
      })
    ).toBe('/from/env');
    expect(
      ps(`Get-ProjectRoot ([pscustomobject]@{ cwd = '/from/cwd' })`, {
        CLAUDE_PROJECT_DIR: undefined,
      })
    ).toBe('/from/cwd');
    expect(ps('Get-ProjectRoot $null', { CLAUDE_PROJECT_DIR: undefined })).toBeNull();
  });

  it('reads seats.json, the reviewer roles, and the hard awards', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-core-'));
    try {
      fs.writeFileSync(
        path.join(root, 'seats.json'),
        JSON.stringify({
          roles: {
            a: { agent: 'reviewer' },
            b: { agent: 'orchestrator' },
            c: { agent: 'reviewer' },
          },
          awards: { hard: { b: { model: 'claude-opus-5-5' } } },
        })
      );
      const seats = `$s = Read-Seats '${root}'; `;
      expect(ps(`${seats}Get-ReviewerRoles $s`)).toEqual(['a', 'c']);
      expect(ps(`${seats}@(Get-HardAwards $s).Count`)).toBe(1);
      expect(ps(`Read-Seats '${path.join(root, 'nope')}'`)).toBeNull();
      expect(ps('@(Get-ReviewerRoles $null).Count')).toBe(0);
      expect(ps('Get-HardAwards $null')).toBeNull();
      expect(ps('Get-HardAwards ([pscustomobject]@{ awards = $null })')).toBeNull();
      expect(ps('Get-HardAwards ([pscustomobject]@{ awards = [pscustomobject]@{} })')).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
