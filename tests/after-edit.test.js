// tests/after-edit.test.js
// Tests for _claude/hooks/after-edit.ps1: a PostToolUse note on Edit and Write, only for a path in
// repo-profile.json's docCurrencyPaths.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const HOOKS = path.join(__dirname, '..', '_claude', 'hooks');
const SCRIPT = path.join(HOOKS, 'after-edit.ps1');

function noteFor(hook) {
  const text = fs.readFileSync(path.join(HOOKS, 'notes.md'), 'utf8');
  const m = new RegExp(`^## ${hook}[ \\t]*\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(
    text
  );
  return m[1].trim().replace(/\s*\r?\n\s*/g, ' ');
}

let root;
let other;

function profile(paths) {
  fs.writeFileSync(
    path.join(root, 'repo-profile.json'),
    JSON.stringify({ docCurrencyPaths: paths })
  );
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'after-edit-'));
  other = fs.mkdtempSync(path.join(os.tmpdir(), 'after-edit-other-'));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(other, { recursive: true, force: true });
});

// Runs the hook. `env` false leaves CLAUDE_PROJECT_DIR unset so the input's cwd is the root.
function run(input, { env = true, script = SCRIPT } = {}) {
  const childEnv = { ...process.env };
  delete childEnv.CLAUDE_PROJECT_DIR;
  if (env) childEnv.CLAUDE_PROJECT_DIR = root;
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: childEnv,
  });
  expect(r.status).toBe(0);
  return (r.stdout || '').trim();
}

const edit = (file, extra = {}) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: file },
  cwd: root,
  ...extra,
});

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('after-edit'))
  : describe;

maybeDescribe('_claude/hooks/after-edit.ps1', () => {
  beforeEach(() => profile(['src/api.js', 'lib/', 'tools/*.ps1', './.github/ci.yml']));

  it('adds the note, naming the path, for an exact path', () => {
    const out = run(edit(path.join(root, 'src', 'api.js')));
    expect(JSON.parse(out)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: noteFor('after-edit').replace('{path}', 'src/api.js'),
      },
    });
  });

  it('matches a folder entry, a pattern entry, and an entry that starts with ./ or a dot', () => {
    expect(run(edit(path.join(root, 'lib', 'deep', 'x.js')))).toContain('lib/deep/x.js');
    expect(run(edit(path.join(root, 'tools', 'a.ps1')))).toContain('tools/a.ps1');
    expect(run(edit(path.join(root, '.github', 'ci.yml')))).toContain('.github/ci.yml');
  });

  it('prints nothing for a path outside the list, or one that only shares a prefix', () => {
    expect(run(edit(path.join(root, 'src', 'other.js')))).toBe('');
    expect(run(edit(path.join(root, 'library', 'x.js')))).toBe('');
    expect(run(edit(path.join(root, 'tools', 'a.js')))).toBe('');
  });

  it('prints nothing for a file outside the project, and for an empty list', () => {
    expect(run(edit(path.join(other, 'src', 'api.js')))).toBe('');
    profile([]);
    expect(run(edit(path.join(root, 'src', 'api.js')))).toBe('');
  });

  it('matches a Windows-style path', () => {
    const win = path.join(root, 'src', 'api.js').split('/').join('\\');
    expect(run(edit(win))).not.toBe('');
  });

  it('falls back to the input cwd when CLAUDE_PROJECT_DIR is unset', () => {
    expect(run(edit(path.join(root, 'src', 'api.js')), { env: false })).toContain('src/api.js');
  });

  it('matches a file in a worktree under the root against the worktree, taken as cwd', () => {
    const wt = path.join(root, 'worktrees', 'issue-99');
    fs.mkdirSync(path.join(wt, 'src'), { recursive: true });
    const hit = run(edit(path.join(wt, 'src', 'api.js'), { cwd: wt }));
    expect(JSON.parse(hit).hookSpecificOutput.additionalContext).toBe(
      noteFor('after-edit').replace('{path}', 'src/api.js')
    );
    expect(run(edit(path.join(wt, 'src', 'other.js'), { cwd: wt }))).toBe('');
    // Seen from the root, the same file is under worktrees/, which no entry names.
    expect(run(edit(path.join(wt, 'src', 'api.js')))).toBe('');
    fs.rmSync(path.join(root, 'worktrees'), { recursive: true, force: true });
  });

  it('never blocks', () => {
    const out = JSON.parse(run(edit(path.join(root, 'src', 'api.js'))));
    expect(out.decision).toBeUndefined();
  });

  it('prints nothing on bad input, a missing path, or a missing profile', () => {
    expect(run('not json at all')).toBe('');
    expect(run('')).toBe('');
    expect(run({ tool_input: {}, cwd: root })).toBe('');
    fs.rmSync(path.join(root, 'repo-profile.json'));
    expect(run(edit(path.join(root, 'src', 'api.js')))).toBe('');
  });

  it('prints nothing when notes.md or hook-core.ps1 cannot be read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'after-edit-lone-'));
    try {
      const lone = path.join(dir, 'after-edit.ps1');
      fs.copyFileSync(SCRIPT, lone);
      expect(run(edit(path.join(root, 'src', 'api.js')), { script: lone })).toBe('');
      fs.copyFileSync(path.join(HOOKS, 'hook-core.ps1'), path.join(dir, 'hook-core.ps1'));
      expect(run(edit(path.join(root, 'src', 'api.js')), { script: lone })).toBe('');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
