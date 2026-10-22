// tests/check-review-evidence.test.js
// Vitest tests for the review-evidence gate: the echo and citation rules in
// scripts/check-review-evidence-core.js on strings, and the CLI on temp git repos (the working-tree
// id, and a saved review checked against it).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const core = require('../scripts/check-review-evidence-core');
const { main, workingTreeId } = require('../scripts/check-review-evidence');

const { echoedTree, findCitations, citationProblems, run } = core;

const ID = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

describe('echoedTree', () => {
  it('reads the id from the first non-empty line', () => {
    expect(echoedTree(`\n\nReviewed tree: ${ID}\nPASS`)).toEqual({ id: ID });
    expect(echoedTree(`PASS. Reviewed tree: ${ID.toUpperCase()}`)).toEqual({ id: ID });
    expect(echoedTree(`Reviewed tree: ${'c'.repeat(64)}\r\n`)).toEqual({ id: 'c'.repeat(64) });
  });

  it('fails an empty review, a first line without the echo, and an id that is not a tree id', () => {
    expect(echoedTree('')).toHaveProperty('error');
    expect(echoedTree('   \n\n')).toHaveProperty('error');
    // The echo on a later line does not count: the first line is the verdict's.
    expect(echoedTree(`PASS\nReviewed tree: ${ID}`).error).toContain('first line');
    expect(echoedTree('Reviewed tree: abc123').error).toContain('not a git tree id');
    expect(echoedTree('Reviewed tree:').error).toContain('first line');
  });
});

describe('findCitations', () => {
  const texts = (s) => findCitations(s).map((c) => c.text);

  it('finds path:line and path:from-to, in prose, backticks, and parentheses', () => {
    const review = [
      'blocker: scripts/a.js:12 skips the last row.',
      'See `tests/b.test.js:3-9` and (package.json:4).',
      'Also ./docs/c.md:1.',
    ].join('\n');
    expect(findCitations(review)).toEqual([
      { path: 'scripts/a.js', from: 12, to: 12, text: 'scripts/a.js:12' },
      { path: 'tests/b.test.js', from: 3, to: 9, text: 'tests/b.test.js:3-9' },
      { path: 'package.json', from: 4, to: 4, text: 'package.json:4' },
      { path: 'docs/c.md', from: 1, to: 1, text: './docs/c.md:1' },
    ]);
  });

  it('reads path:line:column as the line', () => {
    expect(findCitations('src/x.js:7:3')).toEqual([
      { path: 'src/x.js', from: 7, to: 7, text: 'src/x.js:7' },
    ]);
  });

  it('ignores times, ports, URLs, and other evidence forms', () => {
    const review = [
      'At 12:30 it ran; localhost:3000 answered; see https://example.com/a.js:12.',
      'Step 9:5 held. Quoted: "x = 1". Output of `npm test`: 3 passed.',
      'Version v1.2:3 is not a file.',
    ].join('\n');
    expect(texts(review)).toEqual([]);
  });

  it('does not start a citation in the middle of a longer path', () => {
    expect(texts('a/b.js:5')).toEqual(['a/b.js:5']);
    expect(texts('see x/a/b.js:5')).toEqual(['x/a/b.js:5']);
  });
});

describe('citationProblems', () => {
  const lines = { 'a.js': 10, 'empty.txt': 0 };
  const count = (p) => lines[p];
  const problems = (text) => citationProblems(findCitations(text), count);

  it('passes lines inside the file, including the last line and a full range', () => {
    expect(problems('a.js:1 a.js:10 a.js:1-10')).toEqual([]);
  });

  it('fails a line past the end, naming the file length', () => {
    expect(problems('a.js:11')).toEqual(['a.js:11: a.js has 10 line(s)']);
    expect(problems('a.js:9-12')).toEqual(['a.js:9-12: a.js has 10 line(s)']);
  });

  it('fails line 0, a backwards range, and any line of an empty file', () => {
    expect(problems('a.js:0')).toEqual(['a.js:0: not a line range']);
    expect(problems('a.js:5-3')).toEqual(['a.js:5-3: not a line range']);
    expect(problems('empty.txt:1')).toEqual(['empty.txt:1: empty.txt has 0 line(s)']);
  });

  it('fails a file that does not exist', () => {
    expect(problems('src/ghost.js:3')).toEqual([
      'src/ghost.js:3: src/ghost.js is not a file in the working tree',
    ]);
  });

  it('reports a repeated citation once', () => {
    expect(problems('a.js:11, again a.js:11')).toHaveLength(1);
  });
});

describe('run', () => {
  const lineCount = (p) => (p === 'a.js' ? 10 : undefined);
  const verdict = (review, currentTree = ID) => run({ review, currentTree, lineCount });

  it('passes when the echo matches and every citation exists', () => {
    const r = verdict(`Reviewed tree: ${ID}\npraise: a.js:4 does it.`);
    expect(r.exitCode).toBe(0);
    expect(r.lines).toEqual([expect.stringContaining('1 citation(s) exist')]);
  });

  it('passes a review with no citations, and says so', () => {
    const r = verdict(`Reviewed tree: ${ID}\npraise: all good.`);
    expect(r.exitCode).toBe(0);
    expect(r.lines[0]).toContain('0 citation(s)');
  });

  it('fails when the tree changed after the review, naming both ids', () => {
    const r = verdict(`Reviewed tree: ${OTHER}\npraise: a.js:4`);
    expect(r.exitCode).toBe(1);
    expect(r.lines).toEqual([
      expect.stringContaining(`tree ${OTHER}, but the working tree is now ${ID}`),
    ]);
  });

  it('fails a missing echo and a bad citation together, one line each', () => {
    const r = verdict('PASS\nblocker: a.js:99 and nowhere.js:1');
    expect(r.exitCode).toBe(1);
    expect(r.lines).toHaveLength(3);
    for (const line of r.lines) expect(line).toMatch(/^check-review-evidence: FAIL, /);
  });
});

describe('the CLI on a temp repo', () => {
  let root;
  let outside;
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-repo-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-review-'));
    git('init', '-q');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'T');
    write('.gitignore', '.review_state/\n');
    write('src/a.js', 'one\ntwo\nthree\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  const saveReview = (text) => {
    const file = path.join(outside, 'review.txt');
    fs.writeFileSync(file, text);
    return file;
  };

  it('prints the same id twice, and a different one after an edit, a new file, or a deletion', () => {
    const first = workingTreeId(root);
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(workingTreeId(root)).toBe(first);
    expect(main({ root, argv: ['--tree'] })).toEqual({ lines: [first], exitCode: 0 });

    write('src/a.js', 'one\ntwo\nthree\nfour\n');
    const edited = workingTreeId(root);
    expect(edited).not.toBe(first);

    write('src/new.js', 'x\n');
    const added = workingTreeId(root);
    expect(added).not.toBe(edited);

    fs.rmSync(path.join(root, 'src/a.js'));
    expect(workingTreeId(root)).not.toBe(added);
  });

  it('differs from HEAD^{tree} once the working tree changes, and equals it while clean', () => {
    expect(workingTreeId(root)).toBe(git('rev-parse', 'HEAD^{tree}').trim());
    write('src/a.js', 'changed\n');
    expect(workingTreeId(root)).not.toBe(git('rev-parse', 'HEAD^{tree}').trim());
  });

  it('ignores a gitignored review file and leaves the repo index alone', () => {
    const before = workingTreeId(root);
    write('.review_state/review.txt', 'Reviewed tree: x\n');
    expect(workingTreeId(root)).toBe(before);
    expect(git('status', '--porcelain')).toBe('');
  });

  it('passes a review of the current tree whose citations exist, including an untracked file', () => {
    write('src/new.js', 'a\nb\n');
    const id = workingTreeId(root);
    const review = saveReview(
      `Reviewed tree: ${id}\npraise: src/a.js:1-3 and src/new.js:2 hold.\n`
    );
    const r = main({ root, argv: [review] });
    expect(r.exitCode).toBe(0);
    expect(r.lines[0]).toContain('2 citation(s) exist');
  });

  it('fails a PASS after the working tree changed, even by one byte', () => {
    const review = saveReview(`Reviewed tree: ${workingTreeId(root)}\npraise: src/a.js:1\n`);
    write('src/a.js', 'one\ntwo\nthree!\n');
    const r = main({ root, argv: [review] });
    expect(r.exitCode).toBe(1);
    expect(r.lines[0]).toContain('the code changed after the review');
  });

  it('fails a citation past the end of a file, to an ignored file, and to a deleted file', () => {
    write('.review_state/notes.txt', 'x\n');
    const id = workingTreeId(root);
    const review = saveReview(
      `Reviewed tree: ${id}\nblocker: src/a.js:4, .review_state/notes.txt:1, src/gone.js:1\n`
    );
    const r = main({ root, argv: [review] });
    expect(r.exitCode).toBe(1);
    expect(r.lines).toHaveLength(3);
    expect(r.lines[0]).toContain('src/a.js has 3 line(s)');
    expect(r.lines[1]).toContain('.review_state/notes.txt is not a file');
  });

  it('counts a last line with no trailing newline', () => {
    write('src/b.js', 'x\ny');
    const review = saveReview(`Reviewed tree: ${workingTreeId(root)}\nsrc/b.js:2 src/b.js:3\n`);
    const r = main({ root, argv: [review] });
    expect(r.lines).toEqual([expect.stringContaining('src/b.js:3: src/b.js has 2 line(s)')]);
  });

  it('fails plainly on a missing review file, no argument, and an unknown flag', () => {
    expect(main({ root, argv: [path.join(outside, 'none.txt')] }).lines[0]).toContain(
      'cannot read the review file'
    );
    expect(main({ root, argv: [] }).lines[0]).toContain('usage');
    expect(main({ root, argv: ['--bogus'] }).lines[0]).toContain('usage');
  });

  it('fails plainly outside a git repo', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-plain-'));
    try {
      const r = main({ root: plain, argv: ['--tree'] });
      expect(r.exitCode).toBe(1);
      expect(r.lines[0]).toContain('git failed');
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });
});
