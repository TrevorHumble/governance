// tests/before-stop.test.js
// Tests for _claude/hooks/before-stop.ps1: a Stop note that never blocks and goes quiet when the
// stop is already a continuation (stop_hook_active), so the session can end.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const HOOKS = path.join(__dirname, '..', '_claude', 'hooks');
const SCRIPT = path.join(HOOKS, 'before-stop.ps1');

function noteFor(hook) {
  const text = fs.readFileSync(path.join(HOOKS, 'notes.md'), 'utf8');
  const m = new RegExp(`^## ${hook}[ \\t]*\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(
    text
  );
  return m[1].trim().replace(/\s*\r?\n\s*/g, ' ');
}

function run(input, script = SCRIPT) {
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    input,
    encoding: 'utf8',
  });
  expect(r.status).toBe(0);
  return (r.stdout || '').trim();
}

const stop = (extra) => JSON.stringify({ hook_event_name: 'Stop', ...extra });

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('before-stop'))
  : describe;

maybeDescribe('_claude/hooks/before-stop.ps1', () => {
  it('adds the notes.md text as Stop additionalContext, with no decision field', () => {
    for (const input of [stop({ stop_hook_active: false }), stop({})]) {
      expect(JSON.parse(run(input))).toEqual({
        hookSpecificOutput: { hookEventName: 'Stop', additionalContext: noteFor('before-stop') },
      });
    }
  });

  it('prints nothing when stop_hook_active is true, so the session can end', () => {
    expect(run(stop({ stop_hook_active: true }))).toBe('');
    expect(run(stop({ stop_hook_active: 'true' }))).toBe('');
  });

  it('prints nothing on unreadable, empty, or null input', () => {
    expect(run('not json at all')).toBe('');
    expect(run('')).toBe('');
    expect(run('null')).toBe('');
  });

  it('prints nothing when notes.md cannot be read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'before-stop-'));
    try {
      const lone = path.join(dir, 'before-stop.ps1');
      fs.copyFileSync(SCRIPT, lone);
      expect(run(stop({ stop_hook_active: false }), lone)).toBe('');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
