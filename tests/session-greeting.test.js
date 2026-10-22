// tests/session-greeting.test.js
// Tests for .claude/hooks/session-greeting.ps1: the SessionStart greeting, its warnings, and the git
// hooks line. The fixture is a scratch git repo with .githooks/ and tools/setup-hooks.ps1, so the
// hook's core.hooksPath write lands in the scratch repo and never in this one.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const REPO = path.join(__dirname, '..');
const HOOKS = path.join(REPO, '.claude', 'hooks');
const SCRIPT = path.join(HOOKS, 'session-greeting.ps1');

const SEATS = {
  roles: {
    orchestrator: { model: 'claude-sonnet-5-5', effort: 'medium' },
    implementer: { model: 'claude-sonnet-5-5', effort: 'medium' },
  },
  awards: {
    hard: {
      orchestrator: { model: 'claude-opus-5-5', effort: 'high' },
      implementer: { model: 'claude-opus-5-5', effort: 'high' },
    },
  },
};

function notes() {
  const text = fs.readFileSync(path.join(HOOKS, 'notes.md'), 'utf8');
  const section = /^## session-greeting[ \t]*\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(text)[1];
  const out = {};
  for (const line of section.split(/\r?\n/)) {
    const m = /^([a-z-]+): (.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const hooksPath = (cwd) => git(cwd, ['config', '--get', 'core.hooksPath']).stdout.trim();

// The hello line, then the git hooks line for the two states.
const hooksLine = (commitMsg, preCommit, why = '') =>
  notes().githooks.replace('{commitMsg}', commitMsg).replace('{preCommit}', preCommit) +
  (why ? ` ${notes()[why]}` : '');
const armed = () => `${notes().hello} ${hooksLine('armed', 'armed')}`;

// A scratch repo with the two git hooks and the script that arms them, in the hook's own layout.
function makeRepo(prefix, { setup = true, hooks = ['commit-msg', 'pre-commit'] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'seats.json'), JSON.stringify(SEATS));
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.mkdirSync(path.join(dir, '.githooks'));
  for (const h of hooks) fs.writeFileSync(path.join(dir, '.githooks', h), '#!/bin/sh\nexit 0\n');
  if (setup) {
    fs.mkdirSync(path.join(dir, 'tools'));
    fs.copyFileSync(
      path.join(REPO, 'tools', 'setup-hooks.ps1'),
      path.join(dir, 'tools', 'setup-hooks.ps1')
    );
  }
  return dir;
}

let root;
let config;

beforeAll(() => {
  root = makeRepo('greeting-');
  config = fs.mkdtempSync(path.join(os.tmpdir(), 'greeting-config-'));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(config, { recursive: true, force: true });
});

afterEach(() => {
  for (const f of [
    path.join(root, '.claude', 'settings.json'),
    path.join(config, 'settings.json'),
  ]) {
    fs.rmSync(f, { force: true });
  }
});

// Returns the SessionStart additionalContext, or null when the hook printed nothing. The user
// settings folder is a fresh empty one, so the real machine's settings never leak in.
function run(input, { env = {}, project = root } = {}) {
  const childEnv = {
    ...process.env,
    CLAUDE_PROJECT_DIR: project,
    CLAUDE_CONFIG_DIR: config,
    ...env,
  };
  for (const k of Object.keys(childEnv)) if (childEnv[k] === undefined) delete childEnv[k];
  if (!('CLAUDE_CODE_EFFORT_LEVEL' in env)) delete childEnv.CLAUDE_CODE_EFFORT_LEVEL;
  if (!('CLAUDE_CODE_SUBAGENT_MODEL_FORCE' in env))
    delete childEnv.CLAUDE_CODE_SUBAGENT_MODEL_FORCE;
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: childEnv,
  });
  expect(r.status).toBe(0);
  const out = (r.stdout || '').trim();
  if (out === '') return null;
  const parsed = JSON.parse(out);
  expect(Object.keys(parsed)).toEqual(['hookSpecificOutput']);
  expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart');
  return parsed.hookSpecificOutput.additionalContext;
}

const start = (model, extra = {}) => ({
  hook_event_name: 'SessionStart',
  source: 'startup',
  ...(model === undefined ? {} : { model }),
  ...extra,
});

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('session-greeting'))
  : describe;

maybeDescribe('.claude/hooks/session-greeting.ps1: the greeting', () => {
  it('is the hello note and the armed git hooks line when the model is the orchestrator seat', () => {
    expect(run(start('claude-sonnet-5-5'))).toBe(armed());
  });

  it('accepts the hard award orchestrator model, a short alias, and a context-window suffix', () => {
    expect(run(start('claude-opus-5-5'))).toBe(armed());
    expect(run(start('sonnet'))).toBe(armed());
    expect(run(start('claude-sonnet-5-5[1m]'))).toBe(armed());
  });

  it('uses additionalContext, not systemMessage, so the model reads it', () => {
    const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
      input: JSON.stringify(start('claude-sonnet-5-5')),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_CONFIG_DIR: config },
    });
    expect(r.stdout).not.toContain('systemMessage');
  });
});

maybeDescribe('.claude/hooks/session-greeting.ps1: the git hooks', () => {
  let dirs = [];
  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    dirs = [];
  });
  const repo = (opts) => {
    const d = makeRepo('greeting-git-', opts);
    dirs.push(d);
    return d;
  };

  it('sets core.hooksPath in a repo that has not set it, and says both hooks are armed', () => {
    const own = repo();
    expect(hooksPath(own)).toBe('');
    expect(run(start('sonnet'), { project: own })).toBe(armed());
    expect(hooksPath(own)).toBe('.githooks');
  });

  it('arms commit-msg and says pre-commit is not armed when only its file is missing', () => {
    const own = repo({ hooks: ['commit-msg'] });
    expect(run(start('sonnet'), { project: own })).toBe(
      `${notes().hello} ${hooksLine('armed', 'not armed')}`
    );
    expect(hooksPath(own)).toBe('.githooks');
  });

  it('writes nothing and says why when .githooks/commit-msg is missing', () => {
    const own = repo({ hooks: ['pre-commit'] });
    expect(run(start('sonnet'), { project: own })).toBe(
      `${notes().hello} ${hooksLine('not armed', 'not armed', 'githooks-missing')}`
    );
    expect(hooksPath(own)).toBe('');
  });

  it('leaves a custom core.hooksPath alone and reports it', () => {
    const own = repo();
    git(own, ['config', 'core.hooksPath', 'my-hooks']);
    expect(run(start('sonnet'), { project: own })).toBe(
      `${notes().hello} ${hooksLine('not armed', 'not armed', 'githooks-kept')}`
    );
    expect(hooksPath(own)).toBe('my-hooks');
  });

  it('keeps core.hooksPath at .githooks and reports armed when it is already set', () => {
    const own = repo();
    git(own, ['config', 'core.hooksPath', '.githooks']);
    expect(run(start('sonnet'), { project: own })).toBe(armed());
  });

  it('writes nothing to an enclosing repo when the project dir is nested inside it', () => {
    const outer = repo();
    const nested = path.join(outer, 'packages', 'app');
    fs.mkdirSync(path.join(nested, '.githooks'), { recursive: true });
    fs.mkdirSync(path.join(nested, 'tools'));
    fs.writeFileSync(path.join(nested, '.githooks', 'commit-msg'), '#!/bin/sh\nexit 0\n');
    fs.copyFileSync(
      path.join(REPO, 'tools', 'setup-hooks.ps1'),
      path.join(nested, 'tools', 'setup-hooks.ps1')
    );
    expect(run(start('sonnet'), { project: nested })).toBe(
      `${notes().hello} ${hooksLine('not armed', 'not armed', 'githooks-elsewhere')}`
    );
    expect(hooksPath(outer)).toBe('');
    expect(hooksPath(nested)).toBe('');
  });

  it('writes nothing and says why when the project is not a git repo', () => {
    const own = repo();
    fs.rmSync(path.join(own, '.git'), { recursive: true, force: true });
    expect(run(start('sonnet'), { project: own })).toBe(
      `${notes().hello} ${hooksLine('not armed', 'not armed', 'githooks-elsewhere')}`
    );
  });

  it('skips the line, and still greets, when tools/setup-hooks.ps1 is absent', () => {
    const own = repo({ setup: false });
    expect(run(start('sonnet'), { project: own })).toBe(notes().hello);
    expect(hooksPath(own)).toBe('');
  });

  it('keeps the model warning after the git hooks line', () => {
    const out = run(start('claude-fable-5-1'));
    expect(out.startsWith(armed())).toBe(true);
    expect(out).toContain('claude-fable-5-1');
  });
});

maybeDescribe('.claude/hooks/session-greeting.ps1: the session model', () => {
  it('warns when the model is neither seat, naming both', () => {
    const out = run(start('claude-fable-5-1'));
    expect(out).toContain(armed());
    expect(out).toContain(
      notes()
        .model.replace('{model}', 'claude-fable-5-1')
        .replace('{seats}', 'sonnet, or opus on a hard run')
    );
  });

  it('says it could not check when the input carries no model (after /clear or a recovery)', () => {
    const out = run(start(undefined, { source: 'clear' }));
    expect(out).toBe(`${armed()} ${notes().unchecked}`);
  });
});

maybeDescribe('.claude/hooks/session-greeting.ps1: settings that override the seats', () => {
  it('warns when CLAUDE_CODE_EFFORT_LEVEL is set', () => {
    const out = run(start('sonnet'), { env: { CLAUDE_CODE_EFFORT_LEVEL: 'low' } });
    expect(out).toContain(notes().env.replace('{name}', 'CLAUDE_CODE_EFFORT_LEVEL'));
  });

  it('warns when CLAUDE_CODE_SUBAGENT_MODEL_FORCE is 1, and not for any other value', () => {
    const on = run(start('sonnet'), { env: { CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1' } });
    expect(on).toContain(notes().env.replace('{name}', 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1'));
    const off = run(start('sonnet'), { env: { CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '0' } });
    expect(off).toBe(armed());
  });

  it.each([
    ['low', 'orchestrator', 'medium'],
    ['medium', 'orchestrator hard', 'high'],
  ])('warns when maxEffortLevel %s is below a seat, naming %s', (cap, role, effort) => {
    fs.writeFileSync(
      path.join(root, '.claude', 'settings.json'),
      JSON.stringify({ maxEffortLevel: cap })
    );
    const out = run(start('sonnet'));
    expect(out).toContain(
      notes().cap.replace('{cap}', cap).replace('{role}', role).replace('{effort}', effort)
    );
  });

  it('does not warn when the cap is at or above every seat, or max', () => {
    for (const cap of ['high', 'xhigh', 'max']) {
      fs.writeFileSync(
        path.join(root, '.claude', 'settings.json'),
        JSON.stringify({ maxEffortLevel: cap })
      );
      expect(run(start('sonnet'))).toBe(armed());
    }
  });

  it('reads the user settings file too, and the lowest cap wins', () => {
    fs.writeFileSync(
      path.join(root, '.claude', 'settings.json'),
      JSON.stringify({ maxEffortLevel: 'high' })
    );
    fs.writeFileSync(path.join(config, 'settings.json'), JSON.stringify({ maxEffortLevel: 'low' }));
    expect(run(start('sonnet'))).toContain('maxEffortLevel low');
  });

  it('ignores a settings file that is not valid JSON', () => {
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), '{ nope');
    expect(run(start('sonnet'))).toBe(armed());
  });
});

maybeDescribe('.claude/hooks/session-greeting.ps1: a leftover hard marker', () => {
  afterEach(() => fs.rmSync(path.join(root, '.run_state'), { recursive: true, force: true }));

  it('mentions .run_state/hard when it exists at the project root', () => {
    fs.mkdirSync(path.join(root, '.run_state'));
    fs.writeFileSync(path.join(root, '.run_state', 'hard'), '');
    expect(run(start('sonnet'))).toBe(`${armed()} ${notes().marker}`);
  });

  it('says nothing about it when there is no marker', () => {
    expect(run(start('sonnet'))).not.toContain('.run_state');
  });
});

maybeDescribe('.claude/hooks/session-greeting.ps1: an odd seats.json', () => {
  const withSeats = (seats, fn) => {
    const own = fs.mkdtempSync(path.join(os.tmpdir(), 'greeting-odd-'));
    try {
      fs.writeFileSync(
        path.join(own, 'seats.json'),
        typeof seats === 'string' ? seats : JSON.stringify(seats)
      );
      return fn(own);
    } finally {
      fs.rmSync(own, { recursive: true, force: true });
    }
  };

  it('prints the hello line when awards has no hard entry', () => {
    const seats = { roles: SEATS.roles, awards: {} };
    expect(withSeats(seats, (own) => run(start('sonnet'), { project: own }))).toBe(notes().hello);
    expect(
      withSeats({ roles: SEATS.roles, awards: null }, (own) =>
        run(start('sonnet'), { project: own })
      )
    ).toBe(notes().hello);
  });

  it('still checks the model against the orchestrator seat when there is no hard award', () => {
    const seats = { roles: SEATS.roles };
    const out = withSeats(seats, (own) => run(start('claude-fable-5-1'), { project: own }));
    expect(out).toContain('the orchestrator seat is sonnet.');
  });

  it('prints the hello line when roles has no orchestrator, or the file is not an object', () => {
    for (const seats of [{ roles: {} }, '[]', '"text"', '{ not json']) {
      expect(withSeats(seats, (own) => run(start('sonnet'), { project: own }))).toBe(notes().hello);
    }
  });

  it('keeps other warnings when the seat checks cannot run', () => {
    const out = withSeats('{ not json', (own) =>
      run(start('sonnet'), { project: own, env: { CLAUDE_CODE_EFFORT_LEVEL: 'low' } })
    );
    expect(out).toContain('CLAUDE_CODE_EFFORT_LEVEL is set');
  });
});

maybeDescribe('.claude/hooks/session-greeting.ps1: failure modes', () => {
  it('prints nothing on unreadable input', () => {
    expect(run('not json at all')).toBeNull();
    expect(run('')).toBeNull();
    expect(run('null')).toBeNull();
  });

  it('still greets, without the seat checks, when seats.json cannot be read', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'greeting-empty-'));
    try {
      expect(run(start('claude-fable-5-1'), { project: empty })).toBe(notes().hello);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
