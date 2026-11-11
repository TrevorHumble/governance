// tests/seat-drill.test.js
// Guards that a seats-only change needs no test change (#187), so seats.json stays the one place
// models live. (a) No test reads the root seats.json except through tests/shipped-seats.js, and no
// test calls a script main() that would fall back to the root seats without --seats. (b) The drill:
// every test file that uses the shipped seats runs again against a copy whose every model is moved
// to another family, and must still pass.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { validateSeats } = require('../scripts/check-seats-core');
const { SHIPPED_SEATS } = require('./shipped-seats');

const TESTS = __dirname;
const SCRIPTS = path.join(TESTS, '..', 'scripts');
const HELPER = 'shipped-seats.js';
const SELF = path.basename(__filename);
const HINT = 'tests take seats from a fixture or from tests/shipped-seats.js';

const testFiles = () =>
  fs.readdirSync(TESTS).filter((f) => f.endsWith('.js') && f !== HELPER && f !== SELF);
const read = (f) => fs.readFileSync(path.join(TESTS, f), 'utf8');

// Every model moved to a different family, so any test that pins a shipped model fails.
const MOVE = {
  opus: 'claude-sonnet-5-5',
  sonnet: 'claude-opus-5-5',
  fable: 'claude-opus-5-5',
  haiku: 'claude-sonnet-5-5',
};
function drilled(seats) {
  const copy = JSON.parse(JSON.stringify(seats));
  const move = (s) => {
    const family = String(s.model).split('-')[1];
    s.model = MOVE[family] || 'claude-opus-5-5';
  };
  Object.values(copy.roles).forEach(move);
  Object.values(copy.awards || {}).forEach((award) => Object.values(award).forEach(move));
  return copy;
}

describe('a seats-only change needs no test change', () => {
  it('reads the root seats.json only through tests/shipped-seats.js', () => {
    // '..', 'seats.json' or '../seats.json', in a join, a resolve or a require.
    const direct = testFiles().filter((f) => /\.\.['"\s,/\\]*seats\.json/.test(read(f)));
    expect(direct, `${direct.join(', ')} read the root seats.json directly; ${HINT}`).toEqual([]);
  });

  it('passes --seats to every script that would otherwise read the root seats.json', () => {
    const scripts = fs
      .readdirSync(SCRIPTS)
      .filter((f) =>
        /REPO_ROOT,\s*['"]seats\.json['"]/.test(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'))
      )
      .map((f) => f.replace(/\.js$/, ''));
    expect(scripts.length).toBeGreaterThan(0);
    const bare = [];
    for (const f of testFiles()) {
      const text = read(f);
      if (!scripts.some((s) => new RegExp(`\\.\\./scripts/${s}['"]`).test(text))) continue;
      for (const m of text.matchAll(/main\(\{\s*argv:\s*\[([^\]]*)\]/g)) {
        if (!m[1].includes("'--seats'")) bare.push(`${f}: main({ argv: [${m[1].trim()}] })`);
      }
    }
    expect(bare, `these calls read the root seats.json; pass --seats, since ${HINT}`).toEqual([]);
  });

  it('still passes when every shipped model moves to another family', () => {
    const copy = drilled(SHIPPED_SEATS);
    expect(validateSeats(copy)).toEqual([]);
    const users = testFiles().filter((f) => /require\(['"]\.\/shipped-seats['"]\)/.test(read(f)));
    expect(users.length).toBeGreaterThan(0);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seat-drill-'));
    try {
      const file = path.join(dir, 'seats.json');
      fs.writeFileSync(file, JSON.stringify(copy));
      const vitest = path.join(TESTS, '..', 'node_modules', 'vitest', 'vitest.mjs');
      const r = spawnSync(
        process.execPath,
        [vitest, 'run', ...users.map((f) => path.join('tests', f))],
        {
          cwd: path.join(TESTS, '..'),
          env: { ...process.env, GOVERNANCE_SEATS_PATH: file },
          encoding: 'utf8',
        }
      );
      const failed = (r.stdout + r.stderr)
        .split(/\r?\n/)
        .filter((l) => /FAIL\s/.test(l))
        .map((l) => l.trim());
      expect(r.status, `with other models: ${[...new Set(failed)].join('; ')}; ${HINT}`).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 600000);
});
