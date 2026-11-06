// tests/unlock-edits.test.js
// Tests for .claude/hooks/unlock-edits.ps1: a UserPromptExpansion hook that writes the session's
// unlock marker when the owner types one of the five unlocking commands.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const SCRIPT = path.join(__dirname, '..', '.claude', 'hooks', 'unlock-edits.ps1');
const SESSION = 'abc-123';

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'unlock-edits-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function run(input, script = SCRIPT) {
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  expect(r.status).toBe(0);
  return (r.stdout || '').trim();
}

const expansion = (command_name, extra = {}) => ({
  hook_event_name: 'UserPromptExpansion',
  session_id: SESSION,
  cwd: root,
  expansion_type: 'slash_command',
  command_name,
  command_args: '',
  command_source: 'project',
  prompt: `/${command_name}`,
  ...extra,
});
const markers = () =>
  fs.existsSync(path.join(root, '.run_state')) ? fs.readdirSync(path.join(root, '.run_state')) : [];

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('unlock-edits'))
  : describe;

maybeDescribe('.claude/hooks/unlock-edits.ps1', () => {
  for (const name of ['build', 'buildlog', 'rca', 'realign', 'resume']) {
    it(`writes the marker for /${name}, silently`, () => {
      expect(run(expansion(name))).toBe('');
      expect(markers()).toEqual([`unlocked-${SESSION}`]);
    });
  }

  it('writes nothing for another command, or for one in other case', () => {
    run(expansion('goal-writer'));
    run(expansion('Build'));
    expect(markers()).toEqual([]);
  });

  it('writes nothing for an expansion that is not a slash command', () => {
    run(expansion('build', { expansion_type: 'mcp_prompt' }));
    expect(markers()).toEqual([]);
  });

  it('writes nothing for an unsafe or missing session id', () => {
    run(expansion('build', { session_id: '../x' }));
    run(expansion('build', { session_id: undefined }));
    expect(markers()).toEqual([]);
  });

  it('still writes the marker when hook-core.ps1 is missing', () => {
    const lonely = fs.mkdtempSync(path.join(os.tmpdir(), 'unlock-edits-nocore-'));
    try {
      fs.copyFileSync(SCRIPT, path.join(lonely, 'unlock-edits.ps1'));
      run(expansion('build'), path.join(lonely, 'unlock-edits.ps1'));
      expect(markers()).toEqual([`unlocked-${SESSION}`]);
    } finally {
      fs.rmSync(lonely, { recursive: true, force: true });
    }
  });

  it('names the same five commands as the settings.json matcher', () => {
    const script = fs.readFileSync(SCRIPT, 'utf8');
    const listed = [...script.match(/\$UNLOCKING = @\(([^)]*)\)/)[1].matchAll(/'([^']+)'/g)].map(
      (m) => m[1]
    );
    const settings = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '.claude', 'settings.json'), 'utf8')
    );
    const matcher = settings.hooks.UserPromptExpansion[0].matcher;
    const named = matcher.match(/^\^\(([^)]*)\)\$$/)[1].split('|');
    expect(named.sort()).toEqual(listed.sort());
  });

  it('prints nothing on empty or unreadable input', () => {
    expect(run('')).toBe('');
    expect(run('{nope')).toBe('');
    expect(markers()).toEqual([]);
  });
});
