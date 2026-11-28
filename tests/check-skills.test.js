// tests/check-skills.test.js
// Vitest tests for the skill-limits gate: scripts/check-skills-core.js, and the wrapper on this repo.
'use strict';

const fs = require('fs');
const path = require('path');
const { run, parseFrontmatter } = require('../scripts/check-skills-core');
const { main } = require('../scripts/check-skills');

const P = '.claude/skills/a-skill/SKILL.md';
const skill = ({ name = 'a-skill', description = 'Use when testing.', body = 'Body.' } = {}) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;
const text = (r) => r.lines.join('\n');
const check = (opts, notCounted = []) => run([{ path: P, text: skill(opts) }], notCounted);

describe('the rules', () => {
  it('passes a skill inside every limit', () => {
    expect(check().exitCode).toBe(0);
  });

  it('fails a name over 64 characters, and one with other characters', () => {
    expect(check({ name: 'a'.repeat(64) }).exitCode).toBe(0);
    expect(text(check({ name: 'a'.repeat(65) }))).toContain('must be 1 to 64');
    expect(check({ name: 'A_Skill' }).exitCode).toBe(1);
    expect(check({ name: '' }).exitCode).toBe(1);
  });

  it('fails a description over 1,024 characters', () => {
    expect(check({ description: 'd'.repeat(1024) }).exitCode).toBe(0);
    expect(text(check({ description: 'd'.repeat(1025) }))).toContain('1025 characters');
    expect(text(check({ description: '' }))).toContain('0 characters');
  });

  it('fails a body of 500 lines or more, and passes 499 lines ending in a newline', () => {
    // the template adds a blank line before the body and a newline after it: 499 lines
    expect(check({ body: Array(498).fill('x').join('\n') }).exitCode).toBe(0);
    expect(check({ body: Array(499).fill('x').join('\n') }).exitCode).toBe(1);
    expect(text(check({ body: Array(600).fill('x').join('\n') }))).toContain('keep it under 500');
  });

  it('holds a counted skill to 800 tokens, and lets a notCounted one past', () => {
    const body = Array(700).fill('word').join(' ');
    expect(text(check({ body }))).toContain('over the 800-token ceiling');
    expect(check({ body }, ['.claude/skills/a-skill/']).exitCode).toBe(0);
  });

  it('fails a description written as a > or | block, which it cannot measure', () => {
    expect(text(check({ description: '>-' }))).toContain('not as a > or | block');
  });

  it('skips the upstream copy of a vendored skill', () => {
    const r = run([{ path: '.claude/skills/impeccable/SKILL.md', text: 'no frontmatter' }], []);
    expect(r.exitCode).toBe(0);
  });

  it('reads quoted frontmatter values', () => {
    expect(parseFrontmatter('---\nname: "x"\ndescription: \'Use when y.\'\n---\nb')).toEqual({
      name: 'x',
      description: 'Use when y.',
      body: 'b',
    });
  });
});

describe('the reviewer agent', () => {
  it('holds no write or shell tool, so a review can never change the work', () => {
    const agent = fs.readFileSync(path.join(__dirname, '../.claude/agents/reviewer.md'), 'utf8');
    const tools = /^tools:(.*)$/m
      .exec(agent)[1]
      .split(',')
      .map((x) => x.trim());
    for (const banned of ['Bash', 'PowerShell', 'Edit', 'Write', 'NotebookEdit']) {
      expect(tools).not.toContain(banned);
    }
  });
});

describe('the wrapper', () => {
  it('passes on this repo', () => {
    const r = main({ root: path.join(__dirname, '..') });
    expect(text(r)).toContain('check-skills: OK');
  });
});
