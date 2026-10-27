// tests/spawn-check.test.js
// Tests for .claude/hooks/spawn-check.ps1: a PreToolUse deny on Agent when the spawn's model or
// effort differs from its seat in seats.json, read from the role tag that starts the description.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const HOOKS = path.join(__dirname, '..', '.claude', 'hooks');
const SCRIPT = path.join(HOOKS, 'spawn-check.ps1');
const REAL_SEATS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seats.json'), 'utf8'));

// A fixed seats file, so the cases do not move when the shipped seats change.
const SEATS = {
  roles: {
    orchestrator: { agent: 'orchestrator', model: 'claude-sonnet-5-5', effort: 'medium' },
    'issue-reviewer': { agent: 'reviewer', model: 'claude-opus-5-5', effort: 'medium' },
    'code-reviewer': { agent: 'reviewer', model: 'claude-opus-5-5', effort: 'medium' },
    referee: { agent: 'reviewer', model: 'claude-fable-5-1', effort: 'medium' },
  },
  awards: {
    hard: {
      'code-reviewer': { model: 'claude-fable-5-1', effort: 'medium' },
    },
  },
};

let root;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-check-'));
  fs.writeFileSync(path.join(root, 'seats.json'), JSON.stringify(SEATS));
  fs.mkdirSync(path.join(root, '.run_state'));
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const marker = () => path.join(root, '.run_state', 'hard');
afterEach(() => fs.rmSync(marker(), { force: true }));

// Returns the parsed hookSpecificOutput, or null when the hook printed nothing (an allow).
function run(input, { env = true, project = root, script = SCRIPT } = {}) {
  const childEnv = { ...process.env };
  delete childEnv.CLAUDE_PROJECT_DIR;
  if (env) childEnv.CLAUDE_PROJECT_DIR = project;
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: childEnv,
  });
  expect(r.status).toBe(0);
  const out = (r.stdout || '').trim();
  return out === '' ? null : JSON.parse(out).hookSpecificOutput;
}

const spawn = (description, model, effort, extra = {}, toolExtra = {}) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Agent',
  tool_input: {
    description,
    model,
    effort,
    subagent_type: 'general-purpose',
    prompt: 'Go.',
    run_in_background: false,
    ...toolExtra,
  },
  cwd: root,
  ...extra,
});

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('spawn-check'))
  : describe;

maybeDescribe('.claude/hooks/spawn-check.ps1: a spawn that matches its seat', () => {
  it('prints nothing for a match, with a trailing description', () => {
    expect(run(spawn('[orchestrator] build #99', 'sonnet', 'medium'))).toBeNull();
    expect(run(spawn('[code-reviewer] review the PR', 'opus', 'medium'))).toBeNull();
    expect(run(spawn('[referee] decide', 'fable', 'medium'))).toBeNull();
  });

  it('accepts the hard award values for a hard tag', () => {
    expect(run(spawn('[code-reviewer hard] review', 'fable', 'medium'))).toBeNull();
  });

  it('accepts the effort as an object with a level, and a full model ID', () => {
    const input = spawn('[orchestrator] build', 'claude-sonnet-5-5', undefined);
    input.tool_input.effort = { level: 'medium' };
    expect(run(input)).toBeNull();
  });

  it('matches every seat and award in the shipped seats.json', () => {
    const real = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-check-real-'));
    try {
      fs.copyFileSync(path.join(__dirname, '..', 'seats.json'), path.join(real, 'seats.json'));
      for (const [name, seat] of Object.entries(REAL_SEATS.roles)) {
        const alias = seat.model.split('-')[1];
        expect(run(spawn(`[${name}] x`, alias, seat.effort), { project: real })).toBeNull();
      }
      for (const [name, seat] of Object.entries(REAL_SEATS.awards.hard)) {
        const alias = seat.model.split('-')[1];
        expect(run(spawn(`[${name} hard] x`, alias, seat.effort), { project: real })).toBeNull();
      }
    } finally {
      fs.rmSync(real, { recursive: true, force: true });
    }
  });
});

maybeDescribe('.claude/hooks/spawn-check.ps1: a spawn that differs from its seat', () => {
  it('denies a wrong model, and names the seat and what was passed', () => {
    const res = run(spawn('[orchestrator] build', 'opus', 'medium'));
    expect(res.hookEventName).toBe('PreToolUse');
    expect(res.permissionDecision).toBe('deny');
    expect(res.permissionDecisionReason).toContain(
      'The orchestrator seat is model sonnet, effort medium. You passed model opus, effort medium.'
    );
  });

  it('denies a wrong effort', () => {
    const res = run(spawn('[orchestrator] build', 'sonnet', 'high'));
    expect(res.permissionDecision).toBe('deny');
    expect(res.permissionDecisionReason).toContain(
      'effort medium. You passed model sonnet, effort high.'
    );
  });

  it('denies a missing model or effort, shown as none', () => {
    const noModel = run(spawn('[orchestrator] build', undefined, 'medium'));
    expect(noModel.permissionDecisionReason).toContain('model none');
    const noEffort = run(spawn('[orchestrator] build', 'sonnet', undefined));
    expect(noEffort.permissionDecisionReason).toContain('effort none');
  });

  it('denies the default seat values on a hard tag, naming the hard seat', () => {
    const res = run(spawn('[code-reviewer hard] review', 'sonnet', 'medium'));
    expect(res.permissionDecision).toBe('deny');
    expect(res.permissionDecisionReason).toContain(
      'The code-reviewer hard seat is model fable, effort medium.'
    );
  });

  it('prefixes the reason with the hook name', () => {
    expect(run(spawn('[orchestrator] build', 'opus', 'low')).permissionDecisionReason).toMatch(
      /^spawn-check: /
    );
  });
});

maybeDescribe('.claude/hooks/spawn-check.ps1: the role tag', () => {
  it('denies a missing tag and lists the roles', () => {
    for (const d of ['build #99', '', '[] build', 'build [orchestrator]', '[Orchestrator] build']) {
      const res = run(spawn(d, 'sonnet', 'medium'));
      expect(res.permissionDecision).toBe('deny');
      expect(res.permissionDecisionReason).toContain('Start the description with a role tag');
      expect(res.permissionDecisionReason).toContain(
        'Roles: orchestrator, issue-reviewer, code-reviewer, referee'
      );
    }
  });

  it('denies a tag with no description field at all', () => {
    const input = spawn('x', 'sonnet', 'medium');
    delete input.tool_input.description;
    expect(run(input).permissionDecision).toBe('deny');
  });

  it('denies an unknown role, and says which', () => {
    const res = run(spawn('[reviewer] review', 'opus', 'medium'));
    expect(res.permissionDecision).toBe('deny');
    expect(res.permissionDecisionReason).toContain("'reviewer' is not a seat.");
    expect(res.permissionDecisionReason).toContain(
      'Roles: orchestrator, issue-reviewer, code-reviewer, referee'
    );
  });

  it('denies a hard tag for a role with no hard award', () => {
    const res = run(spawn('[referee hard] decide', 'fable', 'medium'));
    expect(res.permissionDecision).toBe('deny');
    expect(res.permissionDecisionReason).toContain("'referee hard' is not a seat.");
  });
});

maybeDescribe('.claude/hooks/spawn-check.ps1: reviewers spawn in the foreground', () => {
  const noFlag = (description, model, effort) => {
    const input = spawn(description, model, effort);
    delete input.tool_input.run_in_background;
    return input;
  };

  it('denies a reviewer role without run_in_background, and says several still run in parallel', () => {
    const res = run(noFlag('[code-reviewer] review', 'opus', 'medium'));
    expect(res.permissionDecision).toBe('deny');
    expect(res.permissionDecisionReason).toContain('run_in_background false');
    expect(res.permissionDecisionReason).toContain('still run in parallel');
  });

  it.each([true, 'false', 0, null])('denies a reviewer when run_in_background is %j', (value) => {
    const input = spawn('[referee] decide', 'fable', 'medium', {}, { run_in_background: value });
    expect(run(input).permissionDecision).toBe('deny');
  });

  it('denies a hard-tagged reviewer in the background too', () => {
    const input = spawn(
      '[code-reviewer hard] review',
      'fable',
      'medium',
      {},
      { run_in_background: true }
    );
    expect(run(input).permissionDecision).toBe('deny');
  });

  it('allows a reviewer when run_in_background is exactly false', () => {
    expect(run(spawn('[referee] decide', 'fable', 'medium'))).toBeNull();
  });

  it('leaves a role that is not a reviewer free to run in the background', () => {
    expect(run(noFlag('[orchestrator] build', 'sonnet', 'medium'))).toBeNull();
    const bg = spawn('[orchestrator] build', 'sonnet', 'medium', {}, { run_in_background: true });
    expect(run(bg)).toBeNull();
  });

  it('reads the reviewer roles from seats.json, not from a list in the hook', () => {
    const own = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-check-own-'));
    try {
      fs.writeFileSync(
        path.join(own, 'seats.json'),
        JSON.stringify({
          roles: {
            auditor: { agent: 'reviewer', model: 'claude-opus-5-5', effort: 'medium' },
            referee: { agent: 'referee', model: 'claude-opus-5-5', effort: 'medium' },
          },
        })
      );
      const bg = (d) => spawn(d, 'opus', 'medium', {}, { run_in_background: true });
      expect(run(bg('[auditor] check'), { project: own, env: true }).permissionDecision).toBe(
        'deny'
      );
      expect(run(bg('[referee] check'), { project: own, env: true })).toBeNull();
    } finally {
      fs.rmSync(own, { recursive: true, force: true });
    }
  });

  it('checks the seat after the foreground rule', () => {
    const res = run(spawn('[referee] decide', 'opus', 'medium'));
    expect(res.permissionDecisionReason).toContain('The referee seat is model fable');
  });
});

maybeDescribe('.claude/hooks/spawn-check.ps1: a reviewer on the session model', () => {
  const turn = (model) =>
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', model } });
  const withTranscript = (lines, description, model, effort) => {
    const file = path.join(root, `session-${Math.random().toString(36).slice(2)}.jsonl`);
    fs.writeFileSync(file, lines.join('\n') + '\n');
    return spawn(description, model, effort, { transcript_path: file });
  };

  it('denies a reviewer whose seat model is the session latest model, and says what to do', () => {
    const res = run(
      withTranscript([turn('claude-opus-5-5')], '[code-reviewer] review', 'opus', 'medium')
    );
    expect(res.permissionDecision).toBe('deny');
    expect(res.permissionDecisionReason).toContain('This session is running on opus');
    expect(res.permissionDecisionReason).toContain('ask the owner to run /model sonnet');
  });

  it('reads the latest assistant message, not an earlier one', () => {
    const later = [turn('claude-opus-5-5'), turn('claude-sonnet-5-5')];
    expect(run(withTranscript(later, '[code-reviewer] review', 'opus', 'medium'))).toBeNull();
    const earlier = [turn('claude-sonnet-5-5'), turn('claude-opus-5-5')];
    expect(
      run(withTranscript(earlier, '[code-reviewer] review', 'opus', 'medium')).permissionDecision
    ).toBe('deny');
  });

  it('reads a transcript path that contains a space', () => {
    const dir = fs.mkdtempSync(path.join(root, 'with space '));
    const file = path.join(dir, 'session.jsonl');
    fs.writeFileSync(file, turn('claude-opus-5-5') + '\n');
    const res = run(spawn('[code-reviewer] review', 'opus', 'medium', { transcript_path: file }));
    expect(res.permissionDecision).toBe('deny');
    expect(res.permissionDecisionReason).toContain('This session is running on opus');
  });

  it('skips an assistant line with no model and a synthetic one, using the earlier real turn', () => {
    const lines = [
      turn('claude-opus-5-5'),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant' } }),
      turn('<synthetic>'),
    ];
    const res = run(withTranscript(lines, '[code-reviewer] review', 'opus', 'medium'));
    expect(res.permissionDecision).toBe('deny');
    expect(res.permissionDecisionReason).toContain('This session is running on opus');
  });

  it('judges the hard award seat for a hard tag', () => {
    const res = run(
      withTranscript([turn('claude-fable-5-1')], '[code-reviewer hard] review', 'fable', 'medium')
    );
    expect(res.permissionDecision).toBe('deny');
    expect(res.permissionDecisionReason).toContain('the model of the code-reviewer hard seat');
  });

  it('leaves a non-reviewer role alone', () => {
    expect(
      run(withTranscript([turn('claude-sonnet-5-5')], '[orchestrator] x', 'sonnet', 'medium'))
    ).toBeNull();
  });

  it('allows when the transcript is missing, empty, unreadable as JSON, or not given', () => {
    const base = spawn('[code-reviewer] review', 'opus', 'medium');
    expect(run(base)).toBeNull();
    expect(run({ ...base, transcript_path: path.join(root, 'no-such.jsonl') })).toBeNull();
    expect(run(withTranscript([], '[code-reviewer] review', 'opus', 'medium'))).toBeNull();
    expect(
      run(
        withTranscript(
          ['not json {', '"type":"assistant"'],
          '[code-reviewer] review',
          'opus',
          'medium'
        )
      )
    ).toBeNull();
  });
});

maybeDescribe('.claude/hooks/spawn-check.ps1: the hard run marker', () => {
  beforeEach(() => fs.writeFileSync(marker(), ''));

  it('denies a tag without hard for a role the award covers', () => {
    const res = run(spawn('[code-reviewer] review', 'opus', 'medium'));
    expect(res.permissionDecision).toBe('deny');
    expect(res.permissionDecisionReason).toContain(
      'This run is hard (.run_state/hard). Tag it [code-reviewer hard].'
    );
  });

  it('allows the hard tag with the award values', () => {
    expect(run(spawn('[code-reviewer hard] review', 'fable', 'medium'))).toBeNull();
  });

  it('leaves a role the award does not cover on its default seat', () => {
    expect(run(spawn('[issue-reviewer] look', 'opus', 'medium'))).toBeNull();
  });

  it('finds the marker at the project root when cwd is a worktree', () => {
    const wt = path.join(root, 'worktrees', 'issue-99');
    fs.mkdirSync(wt, { recursive: true });
    fs.copyFileSync(path.join(root, 'seats.json'), path.join(wt, 'seats.json'));
    const input = spawn('[code-reviewer] review', 'opus', 'medium', { cwd: wt });
    expect(run(input).permissionDecision).toBe('deny');
    fs.rmSync(path.join(root, 'worktrees'), { recursive: true, force: true });
  });

  it('is not seen when no marker exists', () => {
    fs.rmSync(marker());
    expect(run(spawn('[orchestrator] build', 'sonnet', 'medium'))).toBeNull();
  });
});

maybeDescribe('.claude/hooks/spawn-check.ps1: project root and failure modes', () => {
  it('falls back to the input cwd when CLAUDE_PROJECT_DIR is unset', () => {
    expect(run(spawn('[orchestrator] build', 'sonnet', 'medium'), { env: false })).toBeNull();
    expect(
      run(spawn('[orchestrator] build', 'opus', 'medium'), { env: false }).permissionDecision
    ).toBe('deny');
  });

  it('allows, printing nothing, on empty input, null, and input with no tool_input', () => {
    expect(run('')).toBeNull();
    expect(run('  \n')).toBeNull();
    expect(run('null')).toBeNull();
    expect(run({ hook_event_name: 'PreToolUse' })).toBeNull();
  });

  it('denies, failing closed, when the input is not empty but cannot be parsed', () => {
    for (const bad of ['not json at all', '{"tool_input": {', '<xml/>']) {
      const res = run(bad);
      expect(res.permissionDecision).toBe('deny');
      expect(res.permissionDecisionReason).toBe(
        'spawn-check: The spawn input was unreadable. Try again.'
      );
    }
  });

  it('allows when seats.json cannot be read', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-check-empty-'));
    try {
      expect(run(spawn('[orchestrator] build', 'opus', 'low'), { project: empty })).toBeNull();
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('still denies, with one generic line, when notes.md cannot be read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-check-lone-'));
    try {
      const lone = path.join(dir, 'spawn-check.ps1');
      fs.copyFileSync(SCRIPT, lone);
      fs.copyFileSync(path.join(HOOKS, 'hook-core.ps1'), path.join(dir, 'hook-core.ps1'));
      const res = run(spawn('[orchestrator] build', 'opus', 'medium'), { script: lone });
      expect(res.permissionDecision).toBe('deny');
      expect(res.permissionDecisionReason).toBe('spawn-check: denied; see .claude/hooks/notes.md.');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('denies, with one generic line, when hook-core.ps1 cannot be loaded', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-check-nocore-'));
    try {
      const lone = path.join(dir, 'spawn-check.ps1');
      fs.copyFileSync(SCRIPT, lone);
      const res = run(spawn('[orchestrator] build', 'sonnet', 'medium'), { script: lone });
      expect(res.permissionDecision).toBe('deny');
      expect(res.permissionDecisionReason).toBe('spawn-check: denied; see .claude/hooks/notes.md.');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
