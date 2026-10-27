// tests/check-seats.test.js
// Vitest tests for the seats gate: the rules in scripts/check-seats-core.js on fixture objects,
// the seats-only detection, the CLI's base handling on temp git repos, and the shipped seats.json.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const core = require('../scripts/check-seats-core');
const { isSharedPath } = require('../scripts/check-token-budget-core');
const { main } = require('../scripts/check-seats');

const { validateSeats, referenceProblems, modelIdProblems, classifyPr, run, REQUIRED_ROLES } = core;

const seat = (model, effort = 'medium', extra = {}) => ({
  provider: 'anthropic',
  model,
  effort,
  ...extra,
});

// Every role on a legal model: opus reviews issues and code, fable referees, sonnet builds.
function valid() {
  return {
    roles: {
      orchestrator: seat('claude-sonnet-5-5', 'medium', { agent: 'orchestrator', skills: [] }),
      'issue-writer': seat('claude-sonnet-5-5', 'medium', { agent: 'issue-writer', skills: [] }),
      'issue-reviewer': seat('claude-opus-5-5', 'medium', {
        agent: 'reviewer',
        skills: ['reviewing-issues'],
      }),
      implementer: seat('claude-sonnet-5-5', 'medium', { agent: 'implementer', skills: [] }),
      'code-reviewer': seat('claude-opus-5-5', 'medium', {
        agent: 'reviewer',
        skills: ['reviewing-prs', 'reviewing-docs'],
      }),
      referee: seat('claude-fable-5-1', 'medium', { agent: 'reviewer', skills: ['refereeing'] }),
      researcher: seat('claude-sonnet-5-5', 'medium', { agent: 'researcher', skills: [] }),
    },
    awards: {
      hard: {
        orchestrator: seat('claude-opus-5-5', 'high'),
        implementer: seat('claude-opus-5-5', 'high'),
        'issue-reviewer': seat('claude-fable-5-1'),
        'code-reviewer': seat('claude-fable-5-1'),
        referee: seat('claude-sonnet-5-5', 'high'),
      },
    },
  };
}
const withChange = (edit) => {
  const s = valid();
  edit(s);
  return s;
};
const problems = (edit) => validateSeats(withChange(edit));
const has = (list, fragment) => list.some((p) => p.includes(fragment));

describe('a valid file', () => {
  it('has no problems', () => {
    expect(validateSeats(valid())).toEqual([]);
  });

  it('needs no awards key, but an awards key that is null fails', () => {
    const s = valid();
    delete s.awards;
    expect(validateSeats(s)).toEqual([]);
    expect(problems((t) => (t.awards = null))).toEqual(['"awards" must be an object']);
  });

  it('accepts a dated snapshot ID and every known effort word', () => {
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
      expect(problems((s) => (s.roles.researcher = { ...s.roles.researcher, effort }))).toEqual([]);
    }
    const dated = problems((s) => (s.roles.researcher.model = 'claude-haiku-4-20250514'));
    expect(dated).toEqual([]);
    expect(problems((s) => (s.roles.researcher.model = 'claude-haiku-4-5-20251001'))).toEqual([]);
  });
});

describe('required roles', () => {
  it('names every one of the seven', () => {
    expect(REQUIRED_ROLES).toHaveLength(7);
  });

  it('fails a missing role and names it', () => {
    const p = problems((s) => delete s.roles.referee);
    expect(p).toEqual(['required role "referee" has no seat']);
  });

  it('fails a role outside the seven (a typo)', () => {
    const p = problems((s) => {
      s.roles.implementor = s.roles.implementer;
      delete s.roles.implementer;
    });
    expect(has(p, 'role "implementor" is not one of the required roles')).toBe(true);
    expect(has(p, 'required role "implementer" has no seat')).toBe(true);
  });

  it('fails a role that is not an object, without throwing', () => {
    for (const bad of [null, 'opus', 7, [], true]) {
      const p = problems((s) => (s.roles.researcher = bad));
      expect(p).toEqual(['role "researcher" must be an object']);
    }
  });
});

describe('provider, model, and effort', () => {
  it('fails an unknown or missing provider', () => {
    expect(
      has(
        problems((s) => (s.roles.researcher.provider = 'openai')),
        '"openai"'
      )
    ).toBe(true);
    expect(
      has(
        problems((s) => delete s.roles.researcher.provider),
        'unknown provider'
      )
    ).toBe(true);
    // an inherited key such as "constructor" is not a provider
    expect(
      has(
        problems((s) => (s.roles.researcher.provider = 'constructor')),
        'unknown'
      )
    ).toBe(true);
  });

  it('fails an alias, a malformed ID, and a non-string model', () => {
    for (const model of [
      'opus',
      'inherit',
      'sonnet',
      'claude-opus',
      'claude-opus-',
      'claude-opus-5-5-',
      'claude-gpt-5-5',
      'Claude-opus-5-5',
      ' claude-opus-5-5',
      'claude-opus-5-5\n',
      'claude-opus-5-5-2025',
      '',
      null,
      55,
    ]) {
      const p = problems((s) => (s.roles.researcher.model = model));
      expect(has(p, 'is not a well-formed anthropic model ID')).toBe(true);
    }
  });

  it('fails a missing model', () => {
    expect(
      has(
        problems((s) => delete s.roles.researcher.model),
        'well-formed'
      )
    ).toBe(true);
  });

  it('fails an unknown effort, including a wrong case and a missing one', () => {
    for (const effort of ['extreme', 'High', '', 3, null]) {
      const p = problems((s) => (s.roles.researcher.effort = effort));
      expect(has(p, 'is not a known anthropic effort')).toBe(true);
    }
    expect(
      has(
        problems((s) => delete s.roles.researcher.effort),
        'known anthropic effort'
      )
    ).toBe(true);
  });
});

describe('independence', () => {
  it('fails the implementer and code reviewer on one model', () => {
    const p = problems((s) => (s.roles['code-reviewer'].model = 'claude-sonnet-5-5'));
    expect(p).toEqual([
      '"implementer" and "code-reviewer" share the model claude-sonnet-5-5; they must differ',
    ]);
  });

  it('fails the implementer and code reviewer on one model under the hard award', () => {
    const p = problems((s) => (s.awards.hard['code-reviewer'].model = 'claude-opus-5-5'));
    expect(p).toEqual([
      'under award "hard", "implementer" and "code-reviewer" share the model claude-opus-5-5; they must differ',
    ]);
  });

  it('fails the issue writer and issue reviewer on one model under the hard award', () => {
    const p = problems((s) => (s.awards.hard['issue-reviewer'].model = 'claude-sonnet-5-5'));
    expect(p).toEqual([
      'under award "hard", "issue-writer" and "issue-reviewer" share the model claude-sonnet-5-5; they must differ',
    ]);
  });

  it('fails the issue writer and issue reviewer on one model', () => {
    const p = problems((s) => (s.roles['issue-reviewer'].model = 'claude-sonnet-5-5'));
    expect(has(p, '"issue-writer" and "issue-reviewer" share the model claude-sonnet-5-5')).toBe(
      true
    );
  });

  it('fails the referee sharing a model with the implementer or the code reviewer', () => {
    const withImplementer = problems((s) => (s.roles.referee.model = 'claude-sonnet-5-5'));
    expect(has(withImplementer, '"referee" and "implementer"')).toBe(true);
    const withReviewer = problems((s) => (s.roles.referee.model = 'claude-opus-5-5'));
    expect(has(withReviewer, '"referee" and "code-reviewer"')).toBe(true);
  });

  it('fails the referee sharing a model with the code reviewer under the award', () => {
    const p = problems((s) => (s.awards.hard.referee.model = 'claude-fable-5-1'));
    expect(p).toEqual([
      'under award "hard", "referee" and "code-reviewer" share the model claude-fable-5-1; they must differ',
    ]);
  });

  it('fails the referee sharing a model with the implementer under an award that moves the implementer', () => {
    const p = problems((s) => (s.awards.hard.implementer = seat('claude-sonnet-5-5', 'high')));
    expect(has(p, 'under award "hard", "referee" and "implementer"')).toBe(true);
  });

  it('does not repeat a base-role failure under every award', () => {
    const p = problems((s) => (s.roles.referee.model = 'claude-sonnet-5-5'));
    expect(p.filter((x) => x.includes('"referee" and "implementer"'))).toHaveLength(1);
  });
});

describe('awards', () => {
  it('fails an award naming an unknown role', () => {
    const p = problems((s) => (s.awards.hard.implementor = seat('claude-haiku-5-5')));
    expect(p).toEqual(['award "hard" names unknown role "implementor"']);
  });

  it('fails an unknown award name', () => {
    const p = problems((s) => (s.awards['hards'] = {}));
    expect(has(p, 'award "hards" is not a known award')).toBe(true);
  });

  it('fails an award entry that carries agent or skills', () => {
    const p = problems((s) => {
      s.awards.hard['code-reviewer'].agent = 'reviewer';
      s.awards.hard['code-reviewer'].skills = [];
    });
    expect(has(p, 'carries "agent"; an award inherits agent and skills')).toBe(true);
    expect(has(p, 'carries "skills"; an award inherits agent and skills')).toBe(true);
  });

  it('fails any other key on an award entry', () => {
    const p = problems((s) => (s.awards.hard['code-reviewer'].note = 'x'));
    expect(has(p, 'carries "note"; an award entry holds only provider, model, effort')).toBe(true);
  });

  it('holds award entries to the provider, model, and effort rules', () => {
    const entry = (s) => s.awards.hard['code-reviewer'];
    expect(
      has(
        problems((s) => (entry(s).provider = 'x')),
        'award "hard" role'
      )
    ).toBe(true);
    expect(
      has(
        problems((s) => (entry(s).model = 'sonnet')),
        'well-formed'
      )
    ).toBe(true);
    expect(
      has(
        problems((s) => (entry(s).effort = 'warp')),
        'known anthropic effort'
      )
    ).toBe(true);
  });

  it('fails an award entry that is not an object', () => {
    const p = problems((s) => (s.awards.hard['issue-reviewer'] = 'sonnet'));
    expect(p).toEqual(['award "hard" role "issue-reviewer" must be an object']);
    expect(problems((s) => (s.awards.hard = null))).toEqual(['award "hard" must be an object']);
  });
});

describe('agent and skills', () => {
  it('fails a role with no agent, an empty agent, or a non-string agent', () => {
    for (const edit of [
      (s) => delete s.roles.researcher.agent,
      (s) => (s.roles.researcher.agent = ''),
      (s) => (s.roles.researcher.agent = 4),
    ]) {
      expect(problems(edit)).toEqual(['role "researcher" has no agent']);
    }
  });

  it('fails a skill listed under two roles', () => {
    const p = problems((s) => s.roles.referee.skills.push('reviewing-prs'));
    expect(p).toEqual([
      'skill "reviewing-prs" is listed under two roles ("code-reviewer" and "referee")',
    ]);
  });

  it('fails the same skill listed twice under one role', () => {
    const p = problems((s) => s.roles.referee.skills.push('refereeing'));
    expect(p).toEqual(['skill "refereeing" is listed twice under role "referee"']);
  });

  it('prints a two-roles collision once, even when the skill repeats under the second role', () => {
    const p = problems((s) => s.roles.referee.skills.push('reviewing-prs', 'reviewing-prs'));
    expect(p).toEqual([
      'skill "reviewing-prs" is listed twice under role "referee"',
      'skill "reviewing-prs" is listed under two roles ("code-reviewer" and "referee")',
    ]);
  });

  it('fails skills that are not an array of names', () => {
    for (const skills of [undefined, 'reviewing-prs', [1], [''], null]) {
      const p = problems((s) => (s.roles.researcher.skills = skills));
      expect(p).toEqual(['role "researcher" skills must be an array of skill names']);
    }
  });
});

describe('a malformed file', () => {
  it('reports, and does not throw on, a wrong top level', () => {
    for (const bad of [null, [], 'seats', 3, {}, { roles: [] }, { roles: {}, awards: 'x' }]) {
      const p = validateSeats(bad);
      expect(p.length).toBeGreaterThan(0);
    }
  });
});

// The files valid() points at: one agent file per agent, one skill folder per skill.
const TRACKED = [
  '.claude/agents/orchestrator.md',
  '.claude/agents/issue-writer.md',
  '.claude/agents/reviewer.md',
  '.claude/agents/implementer.md',
  '.claude/agents/researcher.md',
  '.claude/skills/reviewing-issues/SKILL.md',
  '.claude/skills/reviewing-prs/SKILL.md',
  '.claude/skills/reviewing-docs/SKILL.md',
  '.claude/skills/refereeing/SKILL.md',
  'seats.json',
];

describe('agents, skills and lenses name real files', () => {
  const refs = (edit, tracked = TRACKED, lenses = []) =>
    referenceProblems(withChange(edit), tracked, lenses);

  it('passes when every name has its file', () => {
    expect(refs(() => {})).toEqual([]);
    expect(referenceProblems(valid(), TRACKED, ['reviewing-prs'])).toEqual([]);
  });

  it('fails an agent with no file in .claude/agents/, and names role and agent', () => {
    const list = refs((s) => (s.roles.researcher.agent = 'no-such-agent'));
    expect(list).toEqual([
      'role "researcher" agent "no-such-agent" is not a file in .claude/agents/',
    ]);
  });

  it('fails an agent that is only a folder, a nested file, or in another folder', () => {
    for (const bad of ['.claude/agents/nested/researcher.md', '.claude/skills/researcher/x.md']) {
      const tracked = TRACKED.filter((f) => f !== '.claude/agents/researcher.md').concat(bad);
      expect(
        has(
          refs(() => {}, tracked),
          'agent "researcher"'
        )
      ).toBe(true);
    }
    expect(
      has(
        refs((s) => (s.roles.researcher.agent = 'a/b')),
        'agent "a/b"'
      )
    ).toBe(true);
  });

  it('fails a skill with no folder in .claude/skills/', () => {
    const list = refs((s) => s.roles['code-reviewer'].skills.push('reviewing-nothing'));
    expect(list).toEqual([
      'role "code-reviewer" skill "reviewing-nothing" is not a folder in .claude/skills/',
    ]);
  });

  it('fails a skill whose name is a file, not a folder', () => {
    const tracked = TRACKED.concat('.claude/skills/loose.md');
    const list = refs((s) => s.roles.researcher.skills.push('loose.md'), tracked);
    expect(has(list, 'skill "loose.md"')).toBe(true);
  });

  it('fails a lens with no folder in .claude/skills/', () => {
    const list = referenceProblems(valid(), TRACKED, ['reviewing-prs', 'ui-lens']);
    expect(list).toEqual(['repo-profile.json lens "ui-lens" is not a folder in .claude/skills/']);
  });

  it('fails a lenses value that is present but not an array of strings', () => {
    for (const bad of ['ui-lens', null, {}, [1], ['ok', 2]]) {
      expect(referenceProblems(valid(), TRACKED, bad)).toEqual([
        'repo-profile.json lenses must be an array of strings',
      ]);
    }
  });

  it('never throws on a malformed file; the shape rules report it', () => {
    for (const bad of [null, 'x', [], { roles: [] }, { roles: { a: null, b: { skills: 'x' } } }]) {
      expect(() => referenceProblems(bad, TRACKED, 'nope')).not.toThrow();
    }
  });
});

describe('model IDs in shared markdown', () => {
  const md = (text, p = 'standards/x.md') => ({ path: p, text });

  it('passes markdown that names no model', () => {
    expect(modelIdProblems([md('Run on the seat in seats.json.')])).toEqual([]);
  });

  it.each([
    'claude-opus-5-5',
    'claude-sonnet-5',
    'claude-haiku-4-5-20251001',
    'claude-fable-5-1',
    'claude-opus-4-20250514',
    'see `claude-sonnet-5-5-preview` here',
  ])('fails %s, dated and suffixed forms included', (id) => {
    expect(modelIdProblems([md(`on line\n${id}`)])).toEqual([
      'standards/x.md names a model ID; model IDs live in seats.json only',
    ]);
  });

  it('does not fail a family word without a version, or a different family', () => {
    expect(modelIdProblems([md('pass the family word, opus or claude-code-guide')])).toEqual([]);
    expect(modelIdProblems([md('claude-other-5-5')])).toEqual([]);
  });

  it('names every file that carries one', () => {
    const list = modelIdProblems([
      md('claude-opus-5-5', 'a.md'),
      md('plain', 'b.md'),
      md('claude-haiku-5', 'c.md'),
    ]);
    expect(list.map((l) => l.split(' ')[0])).toEqual(['a.md', 'c.md']);
  });

  it('is run with the file-name rules, and fails the run', () => {
    const refs = {
      tracked: TRACKED,
      lenses: [],
      sharedMarkdown: [md('claude-opus-5-5', 'AGENTS.md')],
    };
    const r = run(valid(), undefined, refs);
    expect(r.exitCode).toBe(1);
    expect(r.lines).toEqual([
      'check-seats: FAIL, AGENTS.md names a model ID; model IDs live in seats.json only',
    ]);
    expect(run(valid(), undefined, { ...refs, sharedMarkdown: [] }).exitCode).toBe(0);
  });

  it('fails the run on an agent with no file, and skips both rules when refs is omitted', () => {
    const refs = { tracked: [], lenses: [], sharedMarkdown: [] };
    const r = run(valid(), undefined, refs);
    expect(r.exitCode).toBe(1);
    expect(has(r.lines, 'is not a file in .claude/agents/')).toBe(true);
    expect(run(valid()).exitCode).toBe(0);
  });
});

describe('seats-only detection', () => {
  const classify = (edit, changed = ['seats.json'], base = valid()) =>
    classifyPr({ changed, baseSeats: base, headSeats: withChange(edit) });

  it('is seats-only for model and effort changes, and lists them', () => {
    const r = classify((s) => {
      s.roles.implementer.model = 'claude-sonnet-5-6';
      s.roles.implementer.effort = 'max';
    });
    expect(r.seatsOnly).toBe(true);
    expect(r.changes).toEqual([
      {
        seat: 'implementer',
        field: 'model',
        before: 'claude-sonnet-5-5',
        after: 'claude-sonnet-5-6',
      },
      { seat: 'implementer', field: 'effort', before: 'medium', after: 'max' },
    ]);
  });

  it('is seats-only for a provider change and an award seat change, named by award and role', () => {
    const r = classify((s) => {
      s.roles.researcher.provider = 'anthropic2';
      s.awards.hard['code-reviewer'].effort = 'high';
    });
    expect(r.seatsOnly).toBe(true);
    expect(r.changes.map((c) => c.seat)).toEqual(['researcher', 'hard / code-reviewer']);
  });

  it('allows buildlog files and BUILDLOG.md beside seats.json', () => {
    const r = classify(
      (s) => (s.roles.researcher.effort = 'high'),
      ['seats.json', 'buildlog/94-seats.md', 'BUILDLOG.md']
    );
    expect(r.seatsOnly).toBe(true);
  });

  it('is not seats-only when another file changes, and names it', () => {
    const r = classify((s) => (s.roles.researcher.effort = 'high'), ['seats.json', 'README.md']);
    expect(r.seatsOnly).toBe(false);
    expect(r.reasons).toEqual(['it also changes README.md']);
  });

  it('is not seats-only when a rename hides a source, which the changed list names', () => {
    const r = classify(
      (s) => (s.roles.researcher.effort = 'high'),
      ['seats.json', 'buildlog/rules.md', 'standards/rules.md']
    );
    expect(r.seatsOnly).toBe(false);
    expect(r.reasons).toEqual(['it also changes standards/rules.md']);
  });

  it('is not seats-only when seats.json is not among the changed files', () => {
    const r = classify((s) => (s.roles.researcher.effort = 'high'), ['buildlog/x.md']);
    expect(r.seatsOnly).toBe(false);
    expect(r.reasons).toContain('the PR does not change seats.json');
  });

  it('is not seats-only when nothing in seats.json changes', () => {
    const r = classify(() => {});
    expect(r.seatsOnly).toBe(false);
    expect(r.reasons).toEqual(['no seat value changes']);
  });

  it('is not seats-only when an agent changes', () => {
    const r = classify((s) => (s.roles.researcher.agent = 'other'));
    expect(r.seatsOnly).toBe(false);
    expect(r.reasons[0]).toContain('roles.researcher.agent');
  });

  it('is not seats-only when a skills list changes, even by a reorder', () => {
    const reorder = classify((s) => s.roles['code-reviewer'].skills.reverse());
    expect(reorder.seatsOnly).toBe(false);
    expect(reorder.reasons[0]).toContain('roles.code-reviewer.skills');
    expect(classify((s) => s.roles.researcher.skills.push('researching')).seatsOnly).toBe(false);
  });

  it('is not seats-only when a role or an award is added or removed', () => {
    expect(classify((s) => delete s.roles.referee).seatsOnly).toBe(false);
    expect(classify((s) => (s.roles.extra = seat('claude-haiku-5-5'))).seatsOnly).toBe(false);
    expect(classify((s) => delete s.awards.hard).seatsOnly).toBe(false);
    expect(classify((s) => (s.awards.other = {})).seatsOnly).toBe(false);
    expect(classify((s) => delete s.awards.hard['code-reviewer']).seatsOnly).toBe(false);
  });

  it('is not seats-only when a seat field is added or removed, or changes type', () => {
    expect(classify((s) => delete s.roles.researcher.effort).seatsOnly).toBe(false);
    expect(classify((s) => (s.roles.researcher.note = 'x')).seatsOnly).toBe(false);
    expect(classify((s) => (s.roles.researcher.model = { id: 'x' })).seatsOnly).toBe(false);
  });

  it('is not seats-only when the base has no readable seats.json', () => {
    const r = classifyPr({ changed: ['seats.json'], baseSeats: undefined, headSeats: valid() });
    expect(r.seatsOnly).toBe(false);
    expect(r.reasons).toContain('seats.json is not readable at the base');
  });

  it('never throws when the head is not an object', () => {
    for (const head of [null, 'x', []]) {
      const r = classifyPr({ changed: ['seats.json'], baseSeats: valid(), headSeats: head });
      expect(r.seatsOnly).toBe(false);
    }
  });
});

describe('run output', () => {
  const base = (edit, changed = ['seats.json']) => ({
    ref: 'origin/v2',
    baseSeats: valid(),
    changed,
    head: withChange(edit),
  });
  const runBase = ({ head, ...b }) => run(head, b);

  it('prints ok and exits 0 for a valid file with no base', () => {
    const r = run(valid());
    expect(r.exitCode).toBe(0);
    expect(r.lines).toEqual(['check-seats: ok, 7 roles and 1 award(s) hold every rule']);
  });

  it('prints each failure and exits 1', () => {
    const r = run(withChange((s) => delete s.roles.referee));
    expect(r.exitCode).toBe(1);
    expect(r.lines).toEqual(['check-seats: FAIL, required role "referee" has no seat']);
  });

  it('prints the seats-only verdict and a before/after table on stdout lines', () => {
    const r = runBase(base((s) => (s.roles.implementer.model = 'claude-sonnet-5-6')));
    expect(r.exitCode).toBe(0);
    expect(r.lines).toEqual([
      'check-seats: ok, 7 roles and 1 award(s) hold every rule',
      'check-seats: seats-only PR against origin/v2: only provider, model, and effort values change',
      '  Seat         Field  Before             After',
      '  implementer  model  claude-sonnet-5-5  claude-sonnet-5-6',
    ]);
  });

  it('says why a PR is not seats-only, and still exits 0 when the rules hold', () => {
    const r = runBase(base((s) => (s.roles.researcher.agent = 'other')));
    expect(r.exitCode).toBe(0);
    expect(r.lines[1]).toContain('not a seats-only PR against origin/v2');
    expect(r.lines[1]).toContain('roles.researcher.agent');
  });

  it('exits 1 on a rule failure even in a seats-only PR, and still prints the table', () => {
    const r = runBase(base((s) => (s.roles.researcher.effort = 'warp')));
    expect(r.exitCode).toBe(1);
    expect(r.lines.some((l) => l.includes('FAIL'))).toBe(true);
    expect(r.lines.join('\n')).toContain('seats-only PR against origin/v2');
  });
});

describe('the CLI on temp git repos', () => {
  let dir;
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  const write = (rel, body) => {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  };
  const commit = (msg) => {
    git('add', '-A');
    git('commit', '-q', '-m', msg);
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-seats-'));
    git('init', '-q', '-b', 'trunk');
    write('seats.json', valid());
    for (const f of TRACKED.filter((t) => t !== 'seats.json')) write(f, 'x');
    write('governance-manifest.json', { sharedPaths: ['seats.json', 'standards/**', 'AGENTS.md'] });
    write('repo-profile.json', { lenses: [] });
    commit('base');
    git('branch', 'base-copy');
    git('checkout', '-q', '-b', 'topic');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads a seats-only change against --base, in both argument forms', () => {
    write(
      'seats.json',
      withChange((s) => (s.roles.researcher.effort = 'high'))
    );
    commit('seat');
    for (const argv of [['--base', 'trunk'], ['--base=trunk']]) {
      const r = main({ root: dir, argv, env: {} });
      expect(r.exitCode).toBe(0);
      expect(r.lines.join('\n')).toContain('seats-only PR against trunk');
      expect(r.lines.join('\n')).toContain('researcher  effort  medium  high');
    }
  });

  it('is not seats-only when the PR changes another file', () => {
    write(
      'seats.json',
      withChange((s) => (s.roles.researcher.effort = 'high'))
    );
    write('other.txt', 'x');
    commit('seat and more');
    const r = main({ root: dir, argv: ['--base', 'trunk'], env: {} });
    expect(r.exitCode).toBe(0);
    expect(r.lines.join('\n')).toContain('it also changes other.txt');
  });

  it('is not seats-only when a tracked file is renamed into buildlog/, and names the source', () => {
    git('checkout', '-q', 'trunk');
    write('standards/rules.md', 'rules');
    commit('rules');
    git('checkout', '-q', '-b', 'moved', 'trunk');
    write(
      'seats.json',
      withChange((s) => (s.roles.researcher.effort = 'high'))
    );
    fs.mkdirSync(path.join(dir, 'buildlog'));
    git('mv', 'standards/rules.md', 'buildlog/rules.md');
    commit('seat and move');
    const r = main({ root: dir, argv: ['--base', 'trunk'], env: {} });
    expect(r.exitCode).toBe(0);
    expect(r.lines.join('\n')).toContain('not a seats-only PR');
    expect(r.lines.join('\n')).toContain('standards/rules.md');
  });

  it('is not seats-only when the base has no seats.json', () => {
    git('checkout', '-q', 'trunk');
    git('rm', '-q', 'seats.json');
    commit('remove');
    git('checkout', '-q', '-b', 'adds', 'trunk');
    write('seats.json', valid());
    commit('add');
    const r = main({ root: dir, argv: ['--base', 'trunk'], env: {} });
    expect(r.exitCode).toBe(0);
    expect(r.lines.join('\n')).toContain('seats.json is not readable at the base');
  });

  it('is not seats-only when the base seats.json is malformed, and does not fail on it', () => {
    git('checkout', '-q', 'trunk');
    write('seats.json', '{ not json');
    commit('break');
    git('checkout', '-q', '-b', 'repair', 'trunk');
    write('seats.json', valid());
    commit('repair');
    const r = main({ root: dir, argv: ['--base', 'trunk'], env: {} });
    expect(r.exitCode).toBe(0);
    expect(r.lines.join('\n')).toContain('not readable at the base');
  });

  it('takes the base from GITHUB_BASE_REF on a pull_request event', () => {
    write(
      'seats.json',
      withChange((s) => (s.roles.researcher.effort = 'high'))
    );
    commit('seat');
    git('update-ref', 'refs/remotes/origin/trunk', 'base-copy');
    const env = { GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'trunk' };
    const r = main({ root: dir, argv: [], env });
    expect(r.exitCode).toBe(0);
    expect(r.lines.join('\n')).toContain('seats-only PR against origin/trunk');
  });

  it('takes the base from a merge_group payload', () => {
    write(
      'seats.json',
      withChange((s) => (s.roles.researcher.effort = 'high'))
    );
    commit('seat');
    const payload = path.join(dir, '..', `payload-${path.basename(dir)}.json`);
    fs.writeFileSync(
      payload,
      JSON.stringify({ merge_group: { base_sha: git('rev-parse', 'base-copy').trim() } })
    );
    const env = { GITHUB_EVENT_NAME: 'merge_group', GITHUB_EVENT_PATH: payload };
    const r = main({ root: dir, argv: [], env });
    fs.rmSync(payload);
    expect(r.exitCode).toBe(0);
    expect(r.lines.join('\n')).toContain('seats-only PR against');
  });

  it('validates only, with no verdict, when no base applies (a push)', () => {
    const r = main({ root: dir, argv: [], env: { GITHUB_EVENT_NAME: 'push' } });
    expect(r).toEqual({
      lines: ['check-seats: ok, 7 roles and 1 award(s) hold every rule'],
      exitCode: 0,
    });
  });

  it('fails, not crashes, on a missing base, a base that is not a commit, and a base-less PR event', () => {
    const missing = main({ root: dir, argv: ['--base'], env: {} });
    expect(missing.exitCode).toBe(1);
    expect(missing.lines[0]).toContain('--base needs a ref');
    const bad = main({ root: dir, argv: ['--base', 'no-such-ref'], env: {} });
    expect(bad.exitCode).toBe(1);
    expect(bad.lines[0]).toContain('does not resolve to a commit');
    const noRef = main({ root: dir, argv: [], env: { GITHUB_EVENT_NAME: 'pull_request' } });
    expect(noRef.exitCode).toBe(1);
    expect(noRef.lines[0]).toContain('no GITHUB_BASE_REF');
  });

  it('fails on a missing or malformed seats.json at the head', () => {
    write('seats.json', '{ not json');
    const malformed = main({ root: dir, argv: [], env: {} });
    expect(malformed.exitCode).toBe(1);
    expect(malformed.lines[0]).toContain('cannot read seats.json');
    fs.rmSync(path.join(dir, 'seats.json'));
    expect(main({ root: dir, argv: [], env: {} }).exitCode).toBe(1);
  });

  it('fails on a model ID in a shared .md file, and not in an unshared one', () => {
    write('standards/x.md', 'run on claude-opus-5-5');
    commit('model id');
    const r = main({ root: dir, argv: [], env: {} });
    expect(r.exitCode).toBe(1);
    expect(r.lines).toEqual([
      'check-seats: FAIL, standards/x.md names a model ID; model IDs live in seats.json only',
    ]);
    git('rm', '-q', 'standards/x.md');
    write('NOTES.md', 'run on claude-opus-5-5');
    commit('unshared');
    expect(main({ root: dir, argv: [], env: {} }).exitCode).toBe(0);
  });

  it('fails on an agent, a skill or a lens that names no file', () => {
    fs.rmSync(path.join(dir, '.claude/agents/researcher.md'));
    fs.rmSync(path.join(dir, '.claude/skills/refereeing'), { recursive: true });
    write('repo-profile.json', { lenses: ['ui-lens'] });
    commit('break names');
    const r = main({ root: dir, argv: [], env: {} });
    expect(r.exitCode).toBe(1);
    expect(r.lines.join('\n')).toContain('role "researcher" agent "researcher"');
    expect(r.lines.join('\n')).toContain('role "referee" skill "refereeing"');
    expect(r.lines.join('\n')).toContain('lens "ui-lens"');
  });

  it('fails a profile whose lenses is not an array', () => {
    write('repo-profile.json', { lenses: 'ui-lens' });
    commit('bad lenses');
    const r = main({ root: dir, argv: [], env: {} });
    expect(r.exitCode).toBe(1);
    expect(r.lines.join('\n')).toContain('lenses must be an array of strings');
  });

  it('fails, not crashes, on a missing manifest or profile', () => {
    fs.rmSync(path.join(dir, 'governance-manifest.json'));
    const r = main({ root: dir, argv: [], env: {} });
    expect(r.exitCode).toBe(1);
    expect(r.lines[0]).toContain('cannot read the files the name checks need');
  });

  it('exits 1 for a rule failure at the head', () => {
    write(
      'seats.json',
      withChange((s) => delete s.roles.referee)
    );
    const r = main({ root: dir, argv: [], env: {} });
    expect(r.exitCode).toBe(1);
    expect(r.lines[0]).toContain('required role "referee" has no seat');
  });
});

describe('the shipped seats.json', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seats.json'), 'utf8'));

  it('passes every rule', () => {
    expect(validateSeats(shipped)).toEqual([]);
  });

  it('seats each role as the owner set on 2026-10-22', () => {
    const table = Object.fromEntries(
      Object.entries(shipped.roles).map(([r, s]) => [r, [s.provider, s.model, s.effort]])
    );
    expect(table).toEqual({
      orchestrator: ['anthropic', 'claude-sonnet-5-5', 'medium'],
      'issue-writer': ['anthropic', 'claude-sonnet-5-5', 'medium'],
      'issue-reviewer': ['anthropic', 'claude-opus-5-5', 'medium'],
      implementer: ['anthropic', 'claude-sonnet-5-5', 'medium'],
      'code-reviewer': ['anthropic', 'claude-opus-5-5', 'medium'],
      referee: ['anthropic', 'claude-fable-5-1', 'medium'],
      researcher: ['anthropic', 'claude-sonnet-5-5', 'medium'],
    });
    const entry = (model, effort) => ({ provider: 'anthropic', model, effort });
    expect(shipped.awards).toEqual({
      hard: {
        orchestrator: entry('claude-opus-5-5', 'high'),
        implementer: entry('claude-opus-5-5', 'high'),
        'issue-reviewer': entry('claude-fable-5-1', 'medium'),
        'code-reviewer': entry('claude-fable-5-1', 'medium'),
        referee: entry('claude-sonnet-5-5', 'high'),
      },
    });
  });

  it('names real files and carries no model ID in shared markdown', () => {
    const root = path.join(__dirname, '..');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'governance-manifest.json'), 'utf8')
    );
    const r = core.run(shipped, undefined, {
      tracked: execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean),
      lenses: JSON.parse(fs.readFileSync(path.join(root, 'repo-profile.json'), 'utf8')).lenses,
      sharedMarkdown: execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
        .split('\n')
        .filter((f) => f && isSharedPath(f, manifest.sharedPaths))
        .map((f) => ({ path: f, text: fs.readFileSync(path.join(root, f), 'utf8') })),
    });
    expect(r.lines).toEqual(['check-seats: ok, 7 roles and 1 award(s) hold every rule']);
  });

  it('lists the reviewing skills under the code reviewer and the others under their roles', () => {
    expect(shipped.roles['code-reviewer'].skills).toEqual([
      'reviewing-prs',
      'reviewing-architecture',
      'reviewing-design',
      'reviewing-security',
      'reviewing-skills',
      'reviewing-docs',
    ]);
    expect(shipped.roles['issue-reviewer'].skills).toEqual(['reviewing-issues']);
    expect(shipped.roles.referee.skills).toEqual(['refereeing']);
    const others = ['orchestrator', 'issue-writer', 'implementer', 'researcher'];
    for (const role of others) expect(shipped.roles[role].skills).toEqual([]);
  });

  it('is wired as an npm script, a checkCommand, and shared scripts', () => {
    const root = path.join(__dirname, '..');
    const json = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
    expect(json('package.json').scripts['check:seats']).toBe('node scripts/check-seats.js');
    expect(json('repo-profile.json').checkCommands.seats).toBe('npm run check:seats');
    const manifest = json('governance-manifest.json');
    expect(manifest.sharedPaths).toContain('scripts/check-seats.js');
    expect(manifest.sharedPaths).toContain('scripts/check-seats-core.js');
    expect(manifest.sharedPaths).toContain('seats.json');
    expect(manifest.excludedPaths).not.toContain('seats.json');
  });
});
