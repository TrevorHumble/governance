// tests/reviewer-done.test.js
// Tests for .claude/hooks/reviewer-done.ps1: a PostToolUse note on Agent when a reviewer returns.
// The reviewer roles are the seats.json roles whose agent is "reviewer"; no list lives in the hook.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const HOOKS = path.join(__dirname, '..', '.claude', 'hooks');
const SCRIPT = path.join(HOOKS, 'reviewer-done.ps1');

const SEATS = {
  roles: {
    implementer: { agent: 'implementer' },
    'issue-reviewer': { agent: 'reviewer' },
    'code-reviewer': { agent: 'reviewer' },
    referee: { agent: 'reviewer' },
    // A role the hook has never heard of: proof that the list comes from seats.json.
    auditor: { agent: 'reviewer' },
    // A role named like a reviewer whose agent is not one.
    'fake-reviewer': { agent: 'implementer' },
  },
};

function noteFor(hook) {
  const text = fs.readFileSync(path.join(HOOKS, 'notes.md'), 'utf8');
  const m = new RegExp(`^## ${hook}[ \\t]*\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(
    text
  );
  return m[1].trim().replace(/\s*\r?\n\s*/g, ' ');
}

let root;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-done-'));
  fs.writeFileSync(path.join(root, 'seats.json'), JSON.stringify(SEATS));
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function run(input, { script = SCRIPT, project = root } = {}) {
  const childEnv = { ...process.env };
  delete childEnv.CLAUDE_PROJECT_DIR;
  if (project) childEnv.CLAUDE_PROJECT_DIR = project;
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    input,
    encoding: 'utf8',
    env: childEnv,
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

maybeDescribe('.claude/hooks/reviewer-done.ps1', () => {
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

  it('reads the reviewer roles from seats.json: a new reviewer role counts, a non-reviewer agent does not', () => {
    expect(run(returned('[auditor] check it'))).toContain('The auditor has returned.');
    expect(run(returned('[fake-reviewer] check it'))).toBe('');
  });

  it('treats the hard tag as the same role, and never blocks', () => {
    const out = JSON.parse(run(returned('[code-reviewer hard] review the PR')));
    expect(out.hookSpecificOutput.additionalContext).toContain('The code-reviewer has returned.');
    expect(out.decision).toBeUndefined();
  });

  it('prints nothing for other roles, no tag, an unknown role, or a tag that is not first', () => {
    expect(run(returned('[implementer] build #99'))).toBe('');
    expect(run(returned('review #99'))).toBe('');
    expect(run(returned('[stranger] review #99'))).toBe('');
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

  it('prints nothing when seats.json or the project root is missing', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-done-empty-'));
    try {
      expect(run(returned('[referee] decide'), { project: empty })).toBe('');
      expect(run(returned('[referee] decide'), { project: null })).toBe('');
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('prints nothing when notes.md or hook-core.ps1 cannot be read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-done-lone-'));
    try {
      const lone = path.join(dir, 'reviewer-done.ps1');
      fs.copyFileSync(SCRIPT, lone);
      expect(run(returned('[referee] decide'), { script: lone })).toBe('');
      fs.copyFileSync(path.join(HOOKS, 'hook-core.ps1'), path.join(dir, 'hook-core.ps1'));
      expect(run(returned('[referee] decide'), { script: lone })).toBe('');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
