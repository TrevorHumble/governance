// tests/edit-gate.test.js
// Tests for .claude/hooks/edit-gate.ps1: a PreToolUse deny on edits and non-read-only commands until
// the owner has typed an unlocking command in the session (.run_state/unlocked-<session_id>).
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const HOOKS = path.join(__dirname, '..', '.claude', 'hooks');
const SCRIPT = path.join(HOOKS, 'edit-gate.ps1');
const SESSION = 'abc-123';

let root;
let scratch;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-gate-'));
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-gate-scratch-'));
  fs.mkdirSync(path.join(root, '.run_state'));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
});

const marker = (id = SESSION) => path.join(root, '.run_state', `unlocked-${id}`);
afterEach(() => {
  for (const f of fs.readdirSync(path.join(root, '.run_state'))) {
    fs.rmSync(path.join(root, '.run_state', f), { force: true });
  }
});

// Returns the parsed hookSpecificOutput, or null when the hook printed nothing (an allow).
function run(input, { script = SCRIPT } = {}) {
  const childEnv = { ...process.env, CLAUDE_PROJECT_DIR: root };
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: childEnv,
  });
  expect(r.status).toBe(0);
  const out = (r.stdout || '').trim();
  return out === '' ? null : JSON.parse(out).hookSpecificOutput;
}

const call = (tool_name, tool_input, extra = {}) => ({
  hook_event_name: 'PreToolUse',
  session_id: SESSION,
  cwd: root,
  scratchpad_dir: scratch,
  tool_name,
  tool_input,
  ...extra,
});
const edit = (file_path) => call('Edit', { file_path, old_string: 'a', new_string: 'b' });
const bash = (command) => call('Bash', { command });
const pwsh = (command) => call('PowerShell', { command });
const denied = (out) => out !== null && out.permissionDecision === 'deny';

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('edit-gate'))
  : describe;

maybeDescribe('.claude/hooks/edit-gate.ps1: locked session, edits', () => {
  it('denies an edit in the repo, saying to type /build', () => {
    const out = run(edit(path.join(root, 'AGENTS.md')));
    expect(denied(out)).toBe(true);
    expect(out.permissionDecisionReason).toMatch(/^edit-gate: /);
    expect(out.permissionDecisionReason).toContain('/build');
  });

  it('denies Write and NotebookEdit too, and a relative path', () => {
    expect(denied(run(call('Write', { file_path: path.join(root, 'x.md'), content: 'x' })))).toBe(
      true
    );
    expect(denied(run(call('NotebookEdit', { notebook_path: path.join(root, 'n.ipynb') })))).toBe(
      true
    );
    expect(denied(run(edit('src/x.js')))).toBe(true);
  });

  it('denies a path that climbs out of the scratchpad', () => {
    expect(denied(run(edit(path.join(scratch, '..', 'elsewhere.md'))))).toBe(true);
  });

  it('allows the scratchpad, memory and plans', () => {
    const home = os.homedir();
    expect(run(edit(path.join(scratch, 'notes.md')))).toBeNull();
    expect(run(edit(path.join(home, '.claude', 'projects', 'p', 'memory', 'm.md')))).toBeNull();
    expect(run(edit(path.join(home, '.claude', 'plans', 'plan.md')))).toBeNull();
  });

  it("allows the session's own scratchpad by its shape when scratchpad_dir is absent", () => {
    const tmpClaude = path.join(os.tmpdir(), 'claude', 'proj');
    const own = path.join(tmpClaude, SESSION, 'scratchpad', 'a.md');
    const other = path.join(tmpClaude, 'other-session', 'scratchpad', 'a.md');
    expect(run({ ...edit(own), scratchpad_dir: undefined })).toBeNull();
    expect(denied(run({ ...edit(other), scratchpad_dir: undefined }))).toBe(true);
  });

  it('allows a scratch path written with forward slashes', () => {
    expect(run(edit(path.join(scratch, 'notes.md').split(path.sep).join('/')))).toBeNull();
  });

  it('denies an edit that names no file', () => {
    expect(denied(run(call('Edit', { old_string: 'a', new_string: 'b' })))).toBe(true);
  });

  it('denies other places under ~/.claude', () => {
    const home = os.homedir();
    expect(denied(run(edit(path.join(home, '.claude', 'settings.json'))))).toBe(true);
    expect(denied(run(edit(path.join(home, '.claude', 'projects', 'p', 'x.jsonl'))))).toBe(true);
  });
});

maybeDescribe('.claude/hooks/edit-gate.ps1: locked session, commands', () => {
  const allowed = [
    'git status',
    'git log --oneline -5',
    'git diff --stat',
    'git branch --show-current',
    'git remote -v',
    'git worktree list',
    'gh issue view 179',
    'gh pr checks 12',
    'gh api repos/o/r/issues/1',
    'gh api -X GET repos/o/r/pulls',
    'npm test',
    'npm run check:budget',
    'npm run lint',
    'npx vitest run tests/x.test.js',
    'ls -la',
    'cat README.md',
    'bash "$HOME/.claude/scripts/alexa-chirp.sh"',
  ];
  for (const c of allowed) {
    it(`allows: ${c}`, () => expect(run(bash(c))).toBeNull());
  }

  it('allows the PowerShell call operator form of gh, and cmdlets that read', () => {
    expect(run(pwsh('& "C:\\Program Files\\GitHub CLI\\gh.exe" issue view 1'))).toBeNull();
    expect(run(pwsh('Get-Content README.md'))).toBeNull();
    expect(run(pwsh('get-childitem -Recurse'))).toBeNull();
  });

  const refused = [
    'git commit -m x',
    'git branch -D x',
    'git checkout main',
    'git -c core.pager=x log',
    'gh api -X POST repos/o/r/issues',
    'gh api repos/o/r/issues -f title=x',
    'gh api repos/o/r/issues --input body.json',
    'gh issue create',
    'gh pr merge 3',
    'rm -rf x',
    'npm install',
    'npm run lint -- --fix',
    'npx vitest run -u',
    'git diff --output=x.patch',
    'git status; rm x',
    'git status && rm x',
    'cat a > b',
    'cat a | tee b',
    'echo $(rm x)',
    'echo `rm x`',
    'git status\nrm x',
    'bash script.sh',
    'cd /tmp',
    'git remote -v set-url origin https://elsewhere',
    'git remote -v remove origin',
    'git worktree list --porcelain x',
    'npm test --prefix /tmp/x',
    'npm test -- --config /tmp/v.mjs',
    'npm run lint -- -c /tmp/e.mjs',
    'npm run lint -- -o AGENTS.md',
    'npx vitest run --root /tmp/x',
    '/tmp/scratch/gh issue view 1',
    '/tmp/scratch/cat README.md',
  ];
  for (const c of refused) {
    it(`denies: ${JSON.stringify(c)}`, () => expect(denied(run(bash(c)))).toBe(true));
  }

  it('denies PowerShell writes', () => {
    expect(denied(run(pwsh('Set-Content x.md hi')))).toBe(true);
    expect(denied(run(pwsh('Remove-Item x')))).toBe(true);
    expect(denied(run(pwsh('Get-Content a | Set-Content b')))).toBe(true);
    expect(denied(run(pwsh('& "C:\\x\\gh.exe" pr merge 1')))).toBe(true);
  });

  it('denies a program run by a path outside the known ones, such as one in the scratchpad', () => {
    expect(denied(run(pwsh(`& "${path.join(scratch, 'gh')}" issue view 1`)))).toBe(true);
    expect(denied(run(pwsh(`& "${path.join(scratch, 'gh.exe')}" issue view 1`)))).toBe(true);
    expect(denied(run(bash(`${path.join(scratch, 'cat')} README.md`)))).toBe(true);
  });
});

maybeDescribe('.claude/hooks/edit-gate.ps1: unlocked session', () => {
  it("allows everything once this session's marker exists", () => {
    fs.writeFileSync(marker(), 'build');
    expect(run(edit(path.join(root, 'AGENTS.md')))).toBeNull();
    expect(run(bash('git commit -m x'))).toBeNull();
  });

  it("does not unlock on another session's marker", () => {
    fs.writeFileSync(marker('other-session'), 'build');
    expect(denied(run(edit(path.join(root, 'AGENTS.md'))))).toBe(true);
  });

  it('ignores an unsafe session id', () => {
    fs.writeFileSync(marker(), 'build');
    expect(denied(run({ ...edit(path.join(root, 'AGENTS.md')), session_id: '../abc-123' }))).toBe(
      true
    );
  });
});

maybeDescribe('.claude/hooks/edit-gate.ps1: failure cases', () => {
  let lonely;
  beforeAll(() => {
    lonely = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-gate-nocore-'));
    fs.copyFileSync(SCRIPT, path.join(lonely, 'edit-gate.ps1'));
  });
  afterAll(() => fs.rmSync(lonely, { recursive: true, force: true }));

  it('allows an unlocked session even when hook-core.ps1 is missing', () => {
    fs.writeFileSync(marker(), 'build');
    expect(
      run(edit(path.join(root, 'AGENTS.md')), { script: path.join(lonely, 'edit-gate.ps1') })
    ).toBeNull();
  });

  it('denies a locked session when hook-core.ps1 is missing', () => {
    const out = run(bash('git status'), { script: path.join(lonely, 'edit-gate.ps1') });
    expect(denied(out)).toBe(true);
  });

  it('denies unreadable input, allows empty input and input without tool_input', () => {
    expect(denied(run('{not json'))).toBe(true);
    expect(run('')).toBeNull();
    expect(run({ hook_event_name: 'PreToolUse', session_id: SESSION })).toBeNull();
  });

  it('denies an empty or missing command, and trims spaces around a listed one', () => {
    expect(denied(run(bash('')))).toBe(true);
    expect(denied(run(call('Bash', { description: 'x' })))).toBe(true);
    expect(run(bash('  git status  '))).toBeNull();
  });
});
