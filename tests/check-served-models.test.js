// tests/check-served-models.test.js
// Vitest tests for the served-model check: the tag rule, seat choice, and comparison in
// scripts/check-served-models-core.js on fixture objects, and the CLI on the real transcripts under
// tests/fixtures/served-models (spawned before role tags existed, so untagged) and on temp copies
// of them retagged.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../scripts/check-served-models-core');
const { main } = require('../scripts/check-served-models');

const { roleTag, seatFor, servedModels, checkSpawn, run } = core;

const FIXTURE_SESSION = path.join(__dirname, 'fixtures', 'served-models', 'session');
const SEATS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seats.json'), 'utf8'));

const turn = (model) =>
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', model } });
const transcript = (...models) => models.map(turn).join('\n') + '\n';
const metaFor = (description, effort) => ({ description, model: 'x', effort });

describe('roleTag', () => {
  it('reads [<role>] and [<role> hard] at the start of a description', () => {
    expect(roleTag('[orchestrator] build #118')).toEqual({ role: 'orchestrator', hard: false });
    expect(roleTag('[code-reviewer hard] review #118')).toEqual({
      role: 'code-reviewer',
      hard: true,
    });
    expect(roleTag('  [referee] leading space is fine')).toEqual({ role: 'referee', hard: false });
  });

  it('returns null for a description with no tag at its start', () => {
    for (const d of [
      '#118 implement CI',
      'build [orchestrator]',
      '[Orchestrator] x',
      '[] x',
      '[x y]',
    ]) {
      expect(roleTag(d)).toBeNull();
    }
    for (const d of [undefined, null, 7, {}, []]) expect(roleTag(d)).toBeNull();
  });
});

describe('seatFor', () => {
  it('returns the role seat, and the award laid over it on hard', () => {
    expect(seatFor(SEATS, { role: 'orchestrator', hard: false })).toMatchObject({
      model: 'claude-sonnet-5-5',
      effort: 'medium',
    });
    expect(seatFor(SEATS, { role: 'code-reviewer', hard: true })).toMatchObject({
      model: 'claude-fable-5-1',
      effort: 'medium',
    });
  });

  it('falls back to the role seat when hard but the award has no entry for the role', () => {
    expect(seatFor(SEATS, { role: 'orchestrator', hard: true })).toMatchObject({
      model: 'claude-sonnet-5-5',
      effort: 'medium',
    });
  });

  it('returns null for a role seats.json lacks, and for a malformed seats.json', () => {
    expect(seatFor(SEATS, { role: 'nobody', hard: false })).toBeNull();
    expect(seatFor(null, { role: 'orchestrator', hard: false })).toBeNull();
    expect(seatFor({ roles: null }, { role: 'orchestrator', hard: false })).toBeNull();
  });
});

describe('servedModels', () => {
  it('lists each distinct model once, in order, skipping synthetic turns and bad lines', () => {
    const text = [
      turn('claude-opus-5-5'),
      'not json',
      '',
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
      turn('<synthetic>'),
      turn('claude-opus-5-5'),
      turn('claude-sonnet-5-5'),
    ].join('\n');
    expect(servedModels(text)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5']);
  });

  it('returns nothing for an empty transcript', () => {
    expect(servedModels('')).toEqual([]);
  });
});

describe('checkSpawn', () => {
  const check = (description, effort, text) =>
    checkSpawn({ name: 'a1', meta: metaFor(description, effort), transcript: text, seats: SEATS });

  it('is ok when the served model and asked effort equal the seat', () => {
    const r = check('[orchestrator] x', 'medium', transcript('claude-sonnet-5-5'));
    expect(r).toEqual({ name: 'a1', status: 'ok', lines: [] });
  });

  it('checks the award seat for a hard tag', () => {
    expect(check('[code-reviewer hard] x', 'medium', transcript('claude-fable-5-1')).status).toBe(
      'ok'
    );
    const r = check('[code-reviewer hard] x', 'high', transcript('claude-sonnet-5-5'));
    expect(r.status).toBe('mismatch');
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toContain('seat model claude-fable-5-1, served claude-sonnet-5-5');
    expect(r.lines[1]).toContain('seat effort medium, asked high');
  });

  it('reports a served model that differs from the seat', () => {
    const r = check('[code-reviewer] x', 'medium', transcript('claude-sonnet-5-5'));
    expect(r.status).toBe('mismatch');
    expect(r.lines).toEqual([
      expect.stringContaining('seat model claude-opus-5-5, served claude-sonnet-5-5'),
    ]);
  });

  it('reports a spawn served by two models even when one is the seat', () => {
    const r = check(
      '[orchestrator] x',
      'medium',
      transcript('claude-sonnet-5-5', 'claude-opus-5-5')
    );
    expect(r.status).toBe('mismatch');
    expect(r.lines[0]).toContain('served claude-sonnet-5-5, claude-opus-5-5');
  });

  it('reports an effort that differs, and an effort not recorded', () => {
    const wrong = check('[orchestrator] x', 'high', transcript('claude-sonnet-5-5'));
    expect(wrong.lines).toEqual([expect.stringContaining('seat effort medium, asked high')]);
    const none = checkSpawn({
      name: 'a1',
      meta: { description: '[orchestrator] x' },
      transcript: transcript('claude-sonnet-5-5'),
      seats: SEATS,
    });
    expect(none.lines).toEqual([expect.stringContaining('asked nothing recorded')]);
  });

  it('reports a missing transcript and a transcript with no served model', () => {
    const missing = check('[orchestrator] x', 'medium', undefined);
    expect(missing.status).toBe('mismatch');
    expect(missing.lines[0]).toContain('no transcript');
    const empty = check('[orchestrator] x', 'medium', '\n');
    expect(empty.lines[0]).toContain('records no served model');
  });

  it('reports an untagged spawn as untagged and does not guess a seat', () => {
    const r = check('#118 implement CI', 'medium', transcript('claude-sonnet-5-5'));
    expect(r.status).toBe('untagged');
    expect(r.lines).toHaveLength(1);
  });

  it('reports a tag for a role with no seat', () => {
    const r = check('[nobody] x', 'medium', transcript('claude-sonnet-5-5'));
    expect(r.status).toBe('mismatch');
    expect(r.lines[0]).toContain('"nobody"');
  });

  it('does not throw on a meta that is not an object', () => {
    expect(() =>
      checkSpawn({ name: 'a1', meta: null, transcript: '', seats: SEATS })
    ).not.toThrow();
    expect(checkSpawn({ name: 'a1', meta: null, transcript: '', seats: SEATS }).status).toBe(
      'untagged'
    );
  });
});

describe('run', () => {
  it('exits 0 and counts the matches when every spawn is ok', () => {
    const spawns = [
      {
        name: 'a',
        meta: metaFor('[orchestrator] x', 'medium'),
        transcript: transcript('claude-sonnet-5-5'),
      },
    ];
    const r = run(spawns, SEATS);
    expect(r.exitCode).toBe(0);
    expect(r.lines).toEqual([
      'check-served-models: 1 subagent(s): 1 match, 0 mismatch, 0 untagged',
    ]);
  });

  it('prints each mismatch and exits 1', () => {
    const spawns = [
      {
        name: 'a',
        meta: metaFor('[orchestrator] x', 'medium'),
        transcript: transcript('claude-sonnet-5-5'),
      },
      {
        name: 'b',
        meta: metaFor('[referee] y', 'medium'),
        transcript: transcript('claude-opus-5-5'),
      },
    ];
    const r = run(spawns, SEATS);
    expect(r.exitCode).toBe(1);
    expect(r.lines[0]).toMatch(/^check-served-models: mismatch, b \(/);
    expect(r.lines.at(-1)).toContain('1 match, 1 mismatch, 0 untagged');
  });
});

describe('the CLI on real transcripts', () => {
  it('reports the real, untagged spawns as untagged and exits 1', () => {
    const { lines, exitCode } = main({ argv: [FIXTURE_SESSION] });
    expect(exitCode).toBe(1);
    const untagged = lines.filter((l) => l.startsWith('check-served-models: untagged, '));
    expect(untagged).toHaveLength(3);
    expect(lines.at(-1)).toBe(
      'check-served-models: 3 subagent(s): 0 match, 0 mismatch, 3 untagged'
    );
  });

  it('accepts the subagents folder itself', () => {
    const r = main({ argv: [path.join(FIXTURE_SESSION, 'subagents')] });
    expect(r.lines.at(-1)).toContain('3 subagent(s)');
  });

  describe('retagged copies', () => {
    let dir;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'served-models-'));
      fs.cpSync(FIXTURE_SESSION, dir, { recursive: true });
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    const retag = (id, description) => {
      const file = path.join(dir, 'subagents', `agent-${id}.meta.json`);
      const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
      fs.writeFileSync(file, JSON.stringify({ ...meta, description }));
    };

    it('passes when each spawn is tagged for the seat that served it', () => {
      // a328 was served by sonnet and asked for high; a1442 by fable at medium; a7fa by opus at
      // medium.
      retag('a328c05dadefa7e08', '[orchestrator] seat ratchet');
      retag('a1442c218df15290d', '[referee hard] x');
      retag('a7fa399433d9ecf6e', '[code-reviewer] x');
      const r = main({ argv: [dir] });
      expect(r.exitCode).toBe(1);
      // orchestrator: sonnet served is right, effort high was asked against a medium seat.
      expect(
        r.lines.some(
          (l) => l.includes('a328c05dadefa7e08') && l.includes('seat effort medium, asked high')
        )
      ).toBe(true);
      // referee hard: seat is opus/high, fable served and medium asked.
      expect(
        r.lines.some(
          (l) =>
            l.includes('a1442c218df15290d') &&
            l.includes('seat model claude-opus-5-5, served claude-fable-5-1')
        )
      ).toBe(true);
      // code-reviewer: opus/medium, opus served and medium asked.
      expect(r.lines.some((l) => l.includes('a7fa399433d9ecf6e'))).toBe(false);
      expect(r.lines.at(-1)).toContain('1 match, 2 mismatch, 0 untagged');
    });
  });

  it('fails plainly on a missing directory, a directory with no metas, and a bad seats file', () => {
    expect(main({ argv: ['/no/such/dir'] }).exitCode).toBe(1);
    expect(main({ argv: [] }).lines[0]).toContain('usage');
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'served-models-empty-'));
    try {
      expect(main({ argv: [empty] }).lines[0]).toContain('no agent-*.meta.json');
      const r = main({ argv: [FIXTURE_SESSION, '--seats', path.join(empty, 'missing.json')] });
      expect(r.lines[0]).toContain('cannot read');
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
