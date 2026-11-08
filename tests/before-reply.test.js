// tests/before-reply.test.js
// Tests for .claude/hooks/before-reply.ps1: a UserPromptSubmit note that never blocks, and for the
// before-stop.ps1 stub that stays quiet for children still wired to Stop.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const HOOKS = path.join(__dirname, '..', '.claude', 'hooks');
const SCRIPT = path.join(HOOKS, 'before-reply.ps1');
const STUB = path.join(HOOKS, 'before-stop.ps1');

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

const prompt = JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'hello' });

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('before-reply'))
  : describe;

maybeDescribe('.claude/hooks/before-reply.ps1', () => {
  it('adds the notes.md text as UserPromptSubmit additionalContext, with no decision field', () => {
    expect(JSON.parse(run(prompt))).toEqual({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: noteFor('before-reply'),
      },
    });
  });

  it('prints nothing on unreadable, empty, or null input', () => {
    expect(run('not json at all')).toBe('');
    expect(run('')).toBe('');
    expect(run('null')).toBe('');
  });

  it('prints nothing when notes.md or hook-core.ps1 cannot be read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'before-reply-'));
    try {
      const lone = path.join(dir, 'before-reply.ps1');
      fs.copyFileSync(SCRIPT, lone);
      expect(run(prompt, lone)).toBe('');
      fs.copyFileSync(path.join(HOOKS, 'hook-core.ps1'), path.join(dir, 'hook-core.ps1'));
      expect(run(prompt, lone)).toBe('');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

maybeDescribe('.claude/hooks/before-stop.ps1 stub', () => {
  it('prints nothing and exits 0 on a Stop payload, so a child wired to it gets no second reply', () => {
    for (const input of [
      JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false }),
      JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: true }),
      '',
    ]) {
      expect(run(input, STUB)).toBe('');
    }
  });
});
