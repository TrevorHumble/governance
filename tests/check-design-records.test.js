// tests/check-design-records.test.js
// Vitest tests for the design-record check: the rules in scripts/check-design-records-core.js on
// strings, the CLI on temp files, and the real staged design file.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { HEADER, RULE, run, parse } = require('../scripts/check-design-records-core');
const { main } = require('../scripts/check-design-records');

const FILE = 'x/DESIGN.md';

// A record of exactly `words` whitespace-separated tokens, labels and `##` included. Its fixed
// part is `##`, the title, the date line (2), `Decided: yes` (2), `Why:` (1), and `Gave up: no`
// (3); the rest is filler on the Why line.
function record(title = 'Title', words = 20, omit = []) {
  const fixed = 9 + title.split(/\s+/).length;
  const filler = Array.from({ length: Math.max(0, words - fixed) }, () => 'w').join(' ');
  const lines = [
    `## ${title}`,
    '2026-10-22, #100',
    'Decided: yes',
    `Why: ${filler}`,
    'Gave up: no',
  ];
  const labels = { date: 1, Decided: 2, Why: 3, 'Gave up': 4 };
  return lines.filter((_, i) => !omit.some((o) => labels[o] === i)).join('\n');
}

const file = (...records) => `${HEADER}\n\n${records.join('\n\n')}\n`;
const check = (text) => run({ text, path: FILE });
const out = (r) => r.lines.join('\n');

describe('record helper', () => {
  it('builds records of the stated word count', () => {
    for (const n of [100, 101, 150, 151]) {
      expect(parse(file(record('Title', n))).records).toHaveLength(1);
      const r = parse(file(record('Title', n))).records[0];
      expect(r.lines.join('\n').split(/\s+/).filter(Boolean)).toHaveLength(n);
    }
  });
});

describe('run: a passing file', () => {
  it('passes with no note, and says how many records it read', () => {
    const r = check(file(record('First'), record('Second')));
    expect(r.exitCode).toBe(0);
    expect(out(r)).toBe('check-design-records: ok, 2 record(s) in x/DESIGN.md');
  });

  it('passes a file that is only the header', () => {
    expect(check(`${HEADER}\n`).exitCode).toBe(0);
  });
});

describe('run: record length', () => {
  it('passes a record of exactly 150 words and fails one of 151, naming the count', () => {
    expect(check(file(record('Title', 150))).exitCode).toBe(0);
    const r = check(file(record('Title', 151)));
    expect(r.exitCode).toBe(1);
    expect(out(r)).toContain('has 151 words, over the 150 limit');
  });

  it('gives no note at exactly 100 words and a note at 101, which still passes', () => {
    const at100 = check(file(record('Title', 100)));
    expect(at100.exitCode).toBe(0);
    expect(out(at100)).not.toContain('note');
    const at101 = check(file(record('Title', 101)));
    expect(at101.exitCode).toBe(0);
    expect(out(at101)).toContain('check-design-records: note, x/DESIGN.md:5 (Title) has 101 words');
  });

  it('counts the title, the date line, and the labels as words', () => {
    // 150 tokens in the whole record is the limit; one more of any kind is over it.
    expect(check(file(record('Two words', 150))).exitCode).toBe(0);
    expect(check(file(record('Two words', 151))).exitCode).toBe(1);
  });
});

describe('run: the required lines', () => {
  it.each([
    ['date', 'no date and issue line'],
    ['Decided', 'no `Decided:` line'],
    ['Why', 'no `Why:` line'],
    ['Gave up', 'no `Gave up:` line'],
  ])('fails a record without its %s line', (omit, message) => {
    const r = check(file(record('Title', 20, [omit])));
    expect(r.exitCode).toBe(1);
    expect(out(r)).toContain(message);
  });

  it('rejects a date line without a comma or an issue number', () => {
    for (const bad of ['2026-10-22 #100', '2026-10-22, 100', '22-10-2026, #100']) {
      const text = file(record('Title').replace('2026-10-22, #100', bad));
      expect(check(text).exitCode).toBe(1);
    }
  });

  it('reports every problem of a record on one line', () => {
    const r = check(file(record('Title', 20, ['Why', 'Gave up'])));
    expect(r.lines).toHaveLength(1);
    expect(out(r)).toContain('no `Why:` line; has no `Gave up:` line');
  });
});

describe('run: the header', () => {
  it('fails a changed header and prints the expected one', () => {
    const r = check(file(record()).replace('At most 150', 'At most 200'));
    expect(r.exitCode).toBe(1);
    expect(out(r)).toContain('must open with this header');
    expect(out(r)).toContain(HEADER);
  });

  it('fails a file with no header, and an empty file', () => {
    expect(check(`${record()}\n`).exitCode).toBe(1);
    expect(check('').exitCode).toBe(1);
  });

  it('fails extra text between the header and the first record', () => {
    expect(check(file(record()).replace(HEADER, `${HEADER}\n\nAlso this.`)).exitCode).toBe(1);
  });

  it('passes the same header with CRLF line endings', () => {
    expect(check(file(record()).replace(/\n/g, '\r\n')).exitCode).toBe(0);
  });

  it('passes the same header with trailing spaces', () => {
    const spaced = HEADER.split('\n')
      .map((l) => `${l}  \t`)
      .join('\n');
    expect(check(file(record()).replace(HEADER, spaced)).exitCode).toBe(0);
  });

  it('passes the same header with extra blank lines around it and before the first record', () => {
    const text = file(record()).replace(HEADER, `\n\n${HEADER}\n\n\n`);
    expect(check(text).exitCode).toBe(0);
  });
});

describe('run: naming the record', () => {
  it('tells two records with the same title apart by line', () => {
    const r = check(file(record('Same'), record('Same', 151)));
    expect(r.exitCode).toBe(1);
    expect(r.lines).toHaveLength(1);
    // The header is 3 lines, a blank line, then the first record (5 lines), a blank line.
    expect(out(r)).toContain('x/DESIGN.md:11 (Same)');
    expect(out(r)).not.toContain('x/DESIGN.md:5 (Same)');
  });

  it('names a record by the line of its `## ` heading', () => {
    const text = file(record('First'));
    expect(parse(text).records[0].line).toBe(5);
    expect(parse(text.replace(/\n/g, '\r\n')).records[0].line).toBe(5);
  });
});

describe('run: failure output', () => {
  it('repeats the rule in a length failure and in a missing-line failure', () => {
    for (const text of [file(record('Title', 151)), file(record('Title', 20, ['Why']))]) {
      const r = check(text);
      expect(r.exitCode).toBe(1);
      expect(out(r)).toContain(`Rule: ${RULE}`);
    }
  });

  it('names the rule as the header paragraph', () => {
    expect(RULE).toContain('At most 150 words per record; aim for under 100.');
    expect(HEADER).toContain(RULE);
  });

  it('never writes the design file name followed by a quoted heading', () => {
    const core = fs.readFileSync(
      path.join(__dirname, '..', 'scripts', 'check-design-records-core.js'),
      'utf8'
    );
    const cli = fs.readFileSync(
      path.join(__dirname, '..', 'scripts', 'check-design-records.js'),
      'utf8'
    );
    for (const text of [core, cli]) expect(text).not.toMatch(/DESIGN\.md\s+(?:§\s+)?"/);
  });
});

describe('main', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-records-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('checks the file named on the command line', () => {
    const good = path.join(dir, 'good.md');
    fs.writeFileSync(good, file(record()));
    expect(main({ argv: [good] }).exitCode).toBe(0);
    const bad = path.join(dir, 'bad.md');
    fs.writeFileSync(bad, file(record('Title', 151)));
    const r = main({ argv: ['--', bad] });
    expect(r.exitCode).toBe(1);
    expect(out(r)).toContain(`${bad}:5 (Title)`);
  });

  it('fails with a usage line on no argument, two arguments, or a flag', () => {
    for (const argv of [[], ['a', 'b'], ['--tree']]) {
      const r = main({ argv });
      expect(r.exitCode).toBe(1);
      expect(out(r)).toContain('usage: check-design-records.js <design file>');
    }
  });

  it('fails on a file it cannot read', () => {
    const r = main({ argv: [path.join(dir, 'missing.md')] });
    expect(r.exitCode).toBe(1);
    expect(out(r)).toContain('cannot read');
  });
});

describe('the staged design file', () => {
  it('passes, with four records, none over 100 words', () => {
    const p = path.join(__dirname, '..', '_shared', 'DESIGN.md');
    const r = main({ argv: [p] });
    expect(out(r)).not.toContain('note');
    expect(r.exitCode).toBe(0);
    expect(parse(fs.readFileSync(p, 'utf8')).records).toHaveLength(4);
  });
});
