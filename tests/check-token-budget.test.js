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

function writeFileOfWords(rel, words) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Array(words).fill('w').join(' '));
  return rel;
}
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const text = (r) => r.lines.join('\n');

// One light reviewer folder so a list that is not about reviewers still passes that check.
const lightReviewer = () => writeFileOfWords('_claude/skills/reviewing-prs/SKILL.md', 10);

describe('total budget', () => {
  it('passes under budget and prints the total, rounded up once', () => {
    // 100 + 10 words = 110 words * 1.35 = 148.5 -> 149
    const r = run([writeFileOfWords('a.md', 100), lightReviewer()], read);
    expect(r.exitCode).toBe(0);
    expect(text(r)).toContain('149 tokens in total');
  });

  it('passes at exactly 25,000 tokens and fails at 25,001', () => {
    // 18,508 + 10 words = 18,518 * 1.35 = 24,999.3 -> 25,000; one more word gives 25,000.65 -> 25,001
    const at = run([writeFileOfWords('a.md', 18508), lightReviewer()], read);
    expect(at.exitCode).toBe(0);
    expect(text(at)).toContain('25000 tokens in total');
    const over = run([writeFileOfWords('b.md', 18509), lightReviewer()], read);
    expect(over.exitCode).toBe(1);
    expect(text(over)).toContain('25001 tokens in total');
  });

  it('fails over budget, names the total and the largest file', () => {
    const r = run(
      [writeFileOfWords('small.md', 100), writeFileOfWords('huge.md', 20000), lightReviewer()],
      read
    );
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('27149 tokens in total');
    expect(text(r)).toContain('huge.md: 27000 tokens');
    expect(r.lines.findIndex((l) => l.includes('huge.md'))).toBeLessThan(
      r.lines.findIndex((l) => l.includes('small.md'))
    );
  });

  it('shows only the 5 largest files', () => {
    const files = [1, 2, 3, 4, 5, 6].map((n) => writeFileOfWords(`f${n}.md`, n * 4000));
    const r = run([...files, lightReviewer()], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('f6.md');
    expect(text(r)).toContain('f2.md');
    expect(text(r)).not.toContain('f1.md');
  });

  it('counts only .md files: .js, .ps1 and .json add nothing', () => {
    const md = [writeFileOfWords('a.md', 100), lightReviewer()];
    const mixed = [
      ...md,
      writeFileOfWords('x.js', 5000),
      writeFileOfWords('y.ps1', 5000),
      writeFileOfWords('z.json', 5000),
    ];
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
    const a = writeFileOfWords('a.md', 100);
    const r = run([a, a, lightReviewer()], read);
    expect(text(r)).toContain('149 tokens in total');
  });
});

describe('reviewer budget', () => {
  it('fails a heavy reviewer and names it, and passes the light one', () => {
    const files = [
      writeFileOfWords('_claude/skills/reviewing-design/SKILL.md', 5000),
      writeFileOfWords('_claude/skills/reviewing-design/reference/examples.md', 2000),
      writeFileOfWords('_claude/skills/reviewing-prs/SKILL.md', 100),
      writeFileOfWords('standards/reviewing.md', 1000),
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
      writeFileOfWords('_claude/skills/refereeing/SKILL.md', 100),
      writeFileOfWords('_claude/agents/reviewer.md', 100),
    ];
    const r = run(files, read);
    expect(text(r)).toContain('reviewer refereeing: 270 tokens');
  });

  it('does not treat other skills as reviewers', () => {
    const r = run([lightReviewer(), writeFileOfWords('_claude/skills/build/SKILL.md', 9000)], read);
    expect(r.exitCode).toBe(0);
    expect(text(r)).not.toContain('reviewer build');
  });

  it('fails when no reviewer folder exists', () => {
    const r = run([writeFileOfWords('a.md', 10)], read);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('no reviewing-* or refereeing skill folder');
  });

  it('reads both the _claude/ and .claude/ layouts', () => {
    const a = run([writeFileOfWords('_claude/skills/reviewing-prs/SKILL.md', 100)], read);
    const b = run([writeFileOfWords('.claude/skills/reviewing-prs/SKILL.md', 100)], read);
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
    const files = [lightReviewer(), writeFileOfWords('AGENTS.md', 100)];
    const r = run(files, read, { 'AGENTS.md': 1200 });
    // 110 words * 1.35 = 148.5 -> 149
    expect(text(r)).toContain('reviewer reviewing-prs: 149 tokens');
  });

  it('fails when a pending budget pushes a reviewer over', () => {
    const files = [writeFileOfWords('_claude/skills/reviewing-prs/SKILL.md', 6600)];
    // 6600 * 1.35 = 8910, + 1200 = 10,110
    const r = run(files, read, { 'AGENTS.md': 1200 });
    expect(r.exitCode).toBe(1);
    expect(text(r)).toContain('FAIL, reviewer reviewing-prs is 10110 tokens');
  });
});

describe('new-tree.json', () => {
  const root = path.join(__dirname, '..');
  const tree = JSON.parse(fs.readFileSync(path.join(root, 'new-tree.json'), 'utf8'));
  const budgetOf = (f) => (f.group ? tree.groups[f.group] : f.budget);

  it('has every listed file on disk, and each placeholder names its budget', () => {
    for (const f of tree.files) {
      const body = fs.readFileSync(path.join(root, f.path), 'utf8');
      if (body.includes('Placeholder.')) {
        expect(body, f.path).toContain(`${budgetOf(f).toLocaleString('en-US')} tokens`);
      }
    }
  });

  it('has every group member naming a declared group', () => {
    for (const f of tree.files) {
      if (f.group) expect(Object.keys(tree.groups), f.path).toContain(f.group);
    }
  });

  it('has listed budgets that sum to 25,000 or less, counting a group budget once', () => {
    const own = tree.files.filter((f) => !f.group).reduce((sum, f) => sum + f.budget, 0);
    const shared = Object.values(tree.groups).reduce((sum, b) => sum + b, 0);
    expect(own + shared).toBeLessThanOrEqual(25000);
  });

  it('records the AGENTS.md budget as pending and does not list it as a file', () => {
    expect(tree.pending).toEqual([{ path: 'AGENTS.md', budget: 1200 }]);
    expect(tree.files.map((f) => f.path)).not.toContain('AGENTS.md');
  });
});
