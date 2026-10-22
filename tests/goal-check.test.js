// tests/goal-check.test.js
// Tests for _claude/hooks/goal-check.ps1: allow the question, add the note from notes.md.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const HOOKS = path.join(__dirname, '..', '_claude', 'hooks');
const SCRIPT = path.join(HOOKS, 'goal-check.ps1');

// The text under "## <hook>" in notes.md, on one line, the way the hook prints it.
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

const ask = JSON.stringify({
  hook_event_name: 'PreToolUse',
  tool_name: 'AskUserQuestion',
  tool_input: { questions: [{ question: 'Which one?' }] },
});

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('goal-check'))
  : describe;

maybeDescribe('_claude/hooks/goal-check.ps1', () => {
  it('allows the question and puts the notes.md text in additionalContext', () => {
    expect(JSON.parse(run(ask))).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext: noteFor('goal-check'),
      },
    });
  });

  it('points to standards/deciding.md and never denies or blocks', () => {
    const out = JSON.parse(run(ask));
    expect(out.hookSpecificOutput.additionalContext).toContain('standards/deciding.md');
    expect(out.decision).toBeUndefined();
    expect(out.hookSpecificOutput.permissionDecision).not.toBe('deny');
  });

  it('prints nothing on unreadable, empty, or null input', () => {
    expect(run('not json at all')).toBe('');
    expect(run('')).toBe('');
    expect(run('null')).toBe('');
  });

  it('prints nothing when notes.md cannot be read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-check-'));
    try {
      const lone = path.join(dir, 'goal-check.ps1');
      fs.copyFileSync(SCRIPT, lone);
      expect(run(ask, lone)).toBe('');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
