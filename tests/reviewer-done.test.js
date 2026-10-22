// tests/reviewer-done.test.js
// Tests for _claude/hooks/reviewer-done.ps1: a PostToolUse note on Agent when a reviewer returns.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const HOOKS = path.join(__dirname, '..', '_claude', 'hooks');
const SCRIPT = path.join(HOOKS, 'reviewer-done.ps1');

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

const returned = (description, response = { status: 'completed' }) =>
  JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Agent',
    tool_input: { description, model: 'opus', prompt: 'Review it.' },
    tool_response: response,
  });

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('reviewer-done'))
  : describe;

maybeDescribe('_claude/hooks/reviewer-done.ps1', () => {
  it.each(['issue-reviewer', 'code-reviewer', 'referee'])(
    'adds the note, naming the role, when %s returns',
    (role) => {
      expect(JSON.parse(run(returned(`[${role}] review #99`)))).toEqual({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: noteFor('reviewer-done').replace('{role}', role),
        },
      });
    }
  );

  it('treats the hard tag as the same role, and never blocks', () => {
    const out = JSON.parse(run(returned('[code-reviewer hard] review the PR')));
    expect(out.hookSpecificOutput.additionalContext).toContain('The code-reviewer has returned.');
    expect(out.decision).toBeUndefined();
  });

  it('prints nothing for other roles, no tag, or a tag that is not first', () => {
    expect(run(returned('[implementer] build #99'))).toBe('');
    expect(run(returned('review #99'))).toBe('');
    expect(run(returned('see [referee] later'))).toBe('');
  });

  it('prints nothing for a background launch, which has not returned yet', () => {
    expect(run(returned('[referee] decide', { status: 'async_launched' }))).toBe('');
  });

  it('prints nothing on unreadable input or a missing description', () => {
    expect(run('not json at all')).toBe('');
    expect(run('')).toBe('');
    expect(run(JSON.stringify({ tool_input: {} }))).toBe('');
  });

  it('prints nothing when notes.md cannot be read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-done-'));
    try {
      const lone = path.join(dir, 'reviewer-done.ps1');
      fs.copyFileSync(SCRIPT, lone);
      expect(run(returned('[referee] decide'), lone)).toBe('');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
