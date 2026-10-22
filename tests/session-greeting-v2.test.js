// tests/session-greeting-v2.test.js
// Tests for _claude/hooks/session-greeting.ps1: the SessionStart greeting and its warnings. The old
// tests/session-greeting.test.js stays with the old hook until cutover.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const HOOKS = path.join(__dirname, '..', '_claude', 'hooks');
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

let root;
let config;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'greeting-v2-'));
  config = fs.mkdtempSync(path.join(os.tmpdir(), 'greeting-v2-config-'));
  fs.writeFileSync(path.join(root, 'seats.json'), JSON.stringify(SEATS));
  fs.mkdirSync(path.join(root, '.claude'));
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
  ? describe.skip.bind(describe, skipTitle('session-greeting-v2'))
  : describe;

maybeDescribe('_claude/hooks/session-greeting.ps1: the greeting', () => {
  it('is exactly the hello note when the model is the orchestrator seat', () => {
    expect(run(start('claude-sonnet-5-5'))).toBe(notes().hello);
  });

  it('accepts the hard award orchestrator model, a short alias, and a context-window suffix', () => {
    expect(run(start('claude-opus-5-5'))).toBe(notes().hello);
    expect(run(start('sonnet'))).toBe(notes().hello);
    expect(run(start('claude-sonnet-5-5[1m]'))).toBe(notes().hello);
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

maybeDescribe('_claude/hooks/session-greeting.ps1: the session model', () => {
  it('warns when the model is neither seat, naming both', () => {
    const out = run(start('claude-fable-5-1'));
    expect(out).toContain(notes().hello);
    expect(out).toContain(
      notes()
        .model.replace('{model}', 'claude-fable-5-1')
        .replace('{seats}', 'sonnet, or opus on a hard run')
    );
  });

  it('says it could not check when the input carries no model (after /clear or a recovery)', () => {
    const out = run(start(undefined, { source: 'clear' }));
    expect(out).toBe(`${notes().hello} ${notes().unchecked}`);
  });
});

maybeDescribe('_claude/hooks/session-greeting.ps1: settings that override the seats', () => {
  it('warns when CLAUDE_CODE_EFFORT_LEVEL is set', () => {
    const out = run(start('sonnet'), { env: { CLAUDE_CODE_EFFORT_LEVEL: 'low' } });
    expect(out).toContain(notes().env.replace('{name}', 'CLAUDE_CODE_EFFORT_LEVEL'));
  });

  it('warns when CLAUDE_CODE_SUBAGENT_MODEL_FORCE is 1, and not for any other value', () => {
    const on = run(start('sonnet'), { env: { CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1' } });
    expect(on).toContain(notes().env.replace('{name}', 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1'));
    const off = run(start('sonnet'), { env: { CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '0' } });
    expect(off).toBe(notes().hello);
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
      expect(run(start('sonnet'))).toBe(notes().hello);
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
    expect(run(start('sonnet'))).toBe(notes().hello);
  });
});

maybeDescribe('_claude/hooks/session-greeting.ps1: failure modes', () => {
  it('prints nothing on unreadable input', () => {
    expect(run('not json at all')).toBeNull();
    expect(run('')).toBeNull();
    expect(run('null')).toBeNull();
  });

  it('still greets, without the seat checks, when seats.json cannot be read', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'greeting-v2-empty-'));
    try {
      expect(run(start('claude-fable-5-1'), { project: empty })).toBe(notes().hello);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
