// tests/check-token-budget.test.js
// Vitest tests for the token-budget gate: scripts/check-token-budget-core.js on temp files,
// plus a check that new-tree.json and its placeholders agree.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../scripts/check-token-budget-core');

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-budget-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Writes `words` words to `rel` under the temp dir; returns the repo-relative path. */
function make(rel, words) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Array(words).fill('w').join(' '));
  return rel;
}
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const text = (r) => r.lines.join('\n');

// One light reviewer folder so a list that is not about reviewers still passes that check.
const lightReviewer = () => make('_claude/skills/reviewing-prs/SKILL.md', 10);

describe('total budget', () => {
  it('passes under budget and prints the total, rounded up once', () => {
    // 100 + 10 words = 110 words * 1.35 = 148.5 -> 149
    const r = run([make('a.md', 100), lightReviewer()], read);
    expect(r.exitCode).toBe(0);
    expect(text(r)).toContain('149 tokens in total');
  });

  it('passes at exactly 25,000 tokens and fails at 25,001', () => {
    // 18,508 + 10 words = 18,518 * 1.35 = 24,999.3 -> 25,000; one more word gives 25,000.65 -> 25,001
    const at = run([make('a.md', 18508), lightReviewer()], read);
    expect(at.exitCode).toBe(0);
    expect(text(at)).toContain('25000 tokens in total');
    const over = run([make('b.md', 18509), lightReviewer()], read);
    expect(over.exitCode).toBe(1);
    expect(text(over)).toContain('25001 tokens in total');
  });

  it('fails over budget, names the total and the largest file', () => {
    const r = run([make('small.md', 100), make('huge.md', 20000), lightReviewer()], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('27149 tokens in total');
    expect(text(r)).toContain('huge.md: 27000 tokens');
    expect(r.lines.findIndex((l) => l.includes('huge.md'))).toBeLessThan(
      r.lines.findIndex((l) => l.includes('small.md'))
    );
  });

  it('shows only the 5 largest files', () => {
    const files = [1, 2, 3, 4, 5, 6].map((n) => make(`f${n}.md`, n * 4000));
    const r = run([...files, lightReviewer()], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('f6.md');
    expect(text(r)).toContain('f2.md');
    expect(text(r)).not.toContain('f1.md');
  });

  it('counts only .md files: .js, .ps1 and .json add nothing', () => {
    const md = [make('a.md', 100), lightReviewer()];
    const mixed = [...md, make('x.js', 5000), make('y.ps1', 5000), make('z.json', 5000)];
    const r = run(mixed, read);
    expect(r.exitCode).toBe(0);
    expect(text(r)).toContain('149 tokens in total');
  });

  it('fails on an empty file list', () => {
    const r = run([], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('empty');
  });

  it('fails, not crashes, on an unreadable file', () => {
    const r = run(['missing.md', lightReviewer()], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('cannot read missing.md');
  });

  it('counts a file listed twice once', () => {
    const a = make('a.md', 100);
    const r = run([a, a, lightReviewer()], read);
    expect(text(r)).toContain('149 tokens in total');
  });
});

describe('reviewer budget', () => {
  it('fails a heavy reviewer and names it, and passes the light one', () => {
    const files = [
      make('_claude/skills/reviewing-design/SKILL.md', 5000),
      make('_claude/skills/reviewing-design/reference/examples.md', 2000),
      make('_claude/skills/reviewing-prs/SKILL.md', 100),
      make('standards/reviewing.md', 1000),
    ];
    // design: 8000 words * 1.35 = 10,800 > 10,000; prs: 1,100 words = 1,485
    const r = run(files, read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('FAIL, reviewer reviewing-design is 10800 tokens');
    expect(text(r)).not.toContain('FAIL, reviewer reviewing-prs');
    expect(text(r)).toContain('reviewer reviewing-prs: 1485 tokens');
  });

  it('counts the reviewer agent file, and refereeing is a reviewer', () => {
    const files = [
      make('_claude/skills/refereeing/SKILL.md', 100),
      make('_claude/agents/reviewer.md', 100),
    ];
    const r = run(files, read);
    expect(text(r)).toContain('reviewer refereeing: 270 tokens');
  });

  it('does not treat other skills as reviewers', () => {
    const r = run([lightReviewer(), make('_claude/skills/build/SKILL.md', 9000)], read);
    expect(r.exitCode).toBe(0);
    expect(text(r)).not.toContain('reviewer build');
  });

  it('fails when no reviewer folder exists', () => {
    const r = run([make('a.md', 10)], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('no reviewing-* or refereeing skill folder');
  });

  it('reads both the _claude/ and .claude/ layouts', () => {
    const a = run([make('_claude/skills/reviewing-prs/SKILL.md', 100)], read);
    const b = run([make('.claude/skills/reviewing-prs/SKILL.md', 100)], read);
    expect(text(a)).toContain('reviewer reviewing-prs: 135 tokens');
    expect(text(b)).toContain('reviewer reviewing-prs: 135 tokens');
  });

  it('adds a pending AGENTS.md budget to each reviewer, not to the total', () => {
    const files = [lightReviewer()];
    const r = run(files, read, { 'AGENTS.md': 1200 });
    expect(text(r)).toContain('reviewer reviewing-prs: 1214 tokens');
    expect(text(r)).toContain('14 tokens in total');
  });

  it('counts a written AGENTS.md by its words and ignores its pending budget', () => {
    const files = [lightReviewer(), make('AGENTS.md', 100)];
    const r = run(files, read, { 'AGENTS.md': 1200 });
    // 110 words * 1.35 = 148.5 -> 149
    expect(text(r)).toContain('reviewer reviewing-prs: 149 tokens');
  });

  it('fails when a pending budget pushes a reviewer over', () => {
    const files = [make('_claude/skills/reviewing-prs/SKILL.md', 6600)];
    // 6600 * 1.35 = 8910, + 1200 = 10,110
    const r = run(files, read, { 'AGENTS.md': 1200 });
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('FAIL, reviewer reviewing-prs is 10110 tokens');
  });
});

describe('new-tree.json', () => {
  const root = path.join(__dirname, '..');
  const tree = JSON.parse(fs.readFileSync(path.join(root, 'new-tree.json'), 'utf8'));

  it('lists a placeholder or real file for every path, each naming its budget', () => {
    for (const f of tree.files) {
      const body = fs.readFileSync(path.join(root, f.path), 'utf8');
      expect(body, f.path).toContain(`${f.budget} tokens`);
    }
  });

  it('has listed budgets that sum to 25,000 or less, counting a shared budget once', () => {
    const shared = new Map();
    let sum = 0;
    for (const f of tree.files) {
      if (f.group) shared.set(f.group, f.budget);
      else sum += f.budget;
    }
    for (const b of shared.values()) sum += b;
    expect(sum).toBe(20350);
    expect(sum).toBeLessThanOrEqual(25000);
  });

  it('records the AGENTS.md budget as pending and does not list it as a file', () => {
    expect(tree.pending).toEqual([{ path: 'AGENTS.md', budget: 1200 }]);
    expect(tree.files.map((f) => f.path)).not.toContain('AGENTS.md');
  });
});
