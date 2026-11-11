// tests/approve.test.js
// Tests for .claude/hooks/approve.ps1: a UserPromptExpansion hook that, on the owner's typed
// /approve, adds owner-approved to each waiting issue and records the result. gh is a stub.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const SCRIPT = path.join(__dirname, '..', '.claude', 'hooks', 'approve.ps1');

let root;
let stub;
let log;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'approve-'));
  fs.mkdirSync(path.join(root, '.run_state'));
  log = path.join(root, 'gh.log');
  stub = path.join(root, 'gh-stub.ps1');
  // Logs each call. A title read prints "Real <n>"; the label add for issue 13 is refused.
  fs.writeFileSync(
    stub,
    `$a = $args -join ' '\nAdd-Content -LiteralPath '${log}' -Value $a\n` +
      `if ($a -match '/issues/13/labels') { exit 1 }\n` +
      `if ($a -match 'issues/([0-9]+) --jq') { Write-Output "Real $($Matches[1])" }\nexit 0\n`
  );
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const state = (name) => path.join(root, '.run_state', name);
const readJson = (name) => JSON.parse(fs.readFileSync(state(name), 'utf8').replace(/^\uFEFF/, ''));
const writeWaiting = (list) => fs.writeFileSync(state('waiting.json'), JSON.stringify(list));

function run(command_name = 'approve', extra = {}) {
  const input = {
    hook_event_name: 'UserPromptExpansion',
    session_id: 's-1',
    cwd: root,
    expansion_type: 'slash_command',
    command_name,
    prompt: `/${command_name}`,
    ...extra,
  };
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, GOVERNANCE_GH: stub },
  });
  expect(r.status).toBe(0);
  return (r.stdout || '').trim();
}

const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split(/\r?\n/) : []);

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('approve'))
  : describe;

maybeDescribe('.claude/hooks/approve.ps1', () => {
  it('tags every waiting issue, silently, and records each with its title read from GitHub', () => {
    writeWaiting([
      { repo: 'o/r', number: 5, title: 'Listed first' },
      { repo: 'o/other', number: 7, title: 'Listed second' },
    ]);
    expect(run()).toBe('');
    expect(calls()).toEqual([
      'api repos/o/r/issues/5 --jq .title',
      'api repos/o/r/issues/5/labels -f labels[]=owner-approved',
      'api repos/o/other/issues/7 --jq .title',
      'api repos/o/other/issues/7/labels -f labels[]=owner-approved',
    ]);
    expect(readJson('approved-last.json')).toEqual([
      { repo: 'o/r', number: '5', title: 'Real 5', ok: true },
      { repo: 'o/other', number: '7', title: 'Real 7', ok: true },
    ]);
    expect(readJson('waiting.json')).toEqual([]);
  });

  it('handles a list of one, and clears an old result when the list cannot be read', () => {
    writeWaiting([{ repo: 'o/r', number: 5, title: 'Only' }]);
    run();
    expect(readJson('approved-last.json')).toEqual([
      { repo: 'o/r', number: '5', title: 'Real 5', ok: true },
    ]);
    fs.writeFileSync(state('waiting.json'), '{not json');
    run();
    expect(readJson('approved-last.json')).toEqual([]);
  });

  it('keeps a failed issue waiting and marks it not ok', () => {
    writeWaiting([
      { repo: 'o/r', number: 13, title: 'Refused' },
      { repo: 'o/r', number: 5, title: 'Fine' },
    ]);
    run();
    expect(readJson('approved-last.json').map((e) => e.ok)).toEqual([false, true]);
    expect(readJson('waiting.json')).toEqual([{ repo: 'o/r', number: 13, title: 'Refused' }]);
  });

  it('never calls gh for an entry it cannot trust, and keeps it waiting', () => {
    writeWaiting([
      { repo: 'o/r; rm -rf x', number: 5, title: 'Bad repo' },
      { repo: 'o/r', number: '5 --x', title: 'Bad number' },
    ]);
    run();
    expect(calls()).toEqual([]);
    expect(readJson('waiting.json')).toHaveLength(2);
    expect(readJson('approved-last.json').every((e) => e.ok === false)).toBe(true);
  });

  it('records an empty result when nothing is waiting', () => {
    run();
    expect(readJson('approved-last.json')).toEqual([]);
    expect(calls()).toEqual([]);
  });

  it('does nothing for another command or an expansion that is not a slash command', () => {
    writeWaiting([{ repo: 'o/r', number: 5, title: 'First' }]);
    run('build');
    run('Approve');
    run('approve', { expansion_type: 'mcp_prompt' });
    expect(calls()).toEqual([]);
    expect(fs.existsSync(state('approved-last.json'))).toBe(false);
  });

  it('does not unlock edits', () => {
    run();
    expect(
      fs.readdirSync(path.join(root, '.run_state')).some((f) => f.startsWith('unlocked-'))
    ).toBe(false);
  });
});
