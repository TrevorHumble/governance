// tests/check-emdash.test.js
// Vitest tests for the em-dash CI gate: scripts/check-emdash-core.js
// directly, and scripts/check-emdash.js via real git scratch repos.
// Ported from TrevorHumble/wedding-scavenger-hunt (issue #1171); see that
// repo's DESIGN.md, "CI gate for added em dashes", for full rationale.
//
// Every fixture below spells the em dash and its entity forms from Unicode
// code points (String.fromCharCode), never as a literal character or entity
// string, so this file's own source text never contains a form the checker
// it tests would flag.
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findEmdashViolations, hasRevertMarker } = require('../scripts/check-emdash-core');

const EM_DASH = String.fromCharCode(0x2014);
const AMP = String.fromCharCode(0x26); // '&'
const HASH = String.fromCharCode(0x23); // '#'
const SEMI = String.fromCharCode(0x3b); // ';'
const BACKSLASH = String.fromCharCode(0x5c);

const NAMED_WITH_SEMI = `${AMP}mdash${SEMI}`;
const NAMED_NO_SEMI = `${AMP}mdash`;
const DECIMAL_NO_SEMI = `${AMP}${HASH}8212`;
const HEX_LOWER_WITH_SEMI = `${AMP}${HASH}x2014${SEMI}`;
const HEX_UPPER_NO_SEMI = `${AMP}${HASH}X2014`;
const HEX_ZERO_PADDED_WITH_SEMI = `${AMP}${HASH}x02014${SEMI}`;

const FULL_SHA_A = 'a'.repeat(40);
const FULL_SHA_B = 'b'.repeat(40);
const SHORT_SHA = 'a'.repeat(10);

/** Build one file's diff block: header lines plus hunk body lines, joined. */
function fileDiff({ file, oldFile, header = [], hunks }) {
  const from = oldFile || file;
  const lines = [
    `diff --git a/${from} b/${file}`,
    ...header,
    `index 1111111..2222222 100644`,
    `--- a/${from}`,
    `+++ b/${file}`,
  ];
  for (const hunk of hunks) {
    lines.push(hunk.header, ...hunk.body);
  }
  return lines.join('\n');
}

function diffOf(...blocks) {
  return blocks.join('\n');
}

describe('findEmdashViolations: literal and entity forms', () => {
  it('reports an added line with a literal em dash, at the correct new-file line number', () => {
    const diff = fileDiff({
      file: 'src/app.js',
      hunks: [{ header: '@@ -1,0 +1,1 @@', body: [`+const s = 'wait${EM_DASH} really';`] }],
    });
    const violations = findEmdashViolations(diff);
    expect(violations).toEqual([{ file: 'src/app.js', line: 1, match: EM_DASH }]);
  });

  it.each([
    ['named with semicolon', NAMED_WITH_SEMI],
    ['named without semicolon', NAMED_NO_SEMI],
    ['decimal without semicolon', DECIMAL_NO_SEMI],
    ['hex lowercase with semicolon', HEX_LOWER_WITH_SEMI],
    ['hex uppercase X without semicolon', HEX_UPPER_NO_SEMI],
    ['hex zero-padded with semicolon', HEX_ZERO_PADDED_WITH_SEMI],
  ])('reports an added line with the %s entity form', (_label, entity) => {
    const diff = fileDiff({
      file: 'docs/example.html',
      hunks: [{ header: '@@ -1,0 +1,1 @@', body: [`+<p>wait${entity} really</p>`] }],
    });
    const violations = findEmdashViolations(diff);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: 'docs/example.html', line: 1 });
  });

  it('reports correct line numbers across multiple hunks in one file', () => {
    const diff = fileDiff({
      file: 'src/app.js',
      hunks: [
        { header: '@@ -1,0 +1,1 @@', body: [`+const clean = 1;`] },
        { header: '@@ -20,0 +21,2 @@', body: [`+const also = 2;`, `+const bad = 'x${EM_DASH}y';`] },
      ],
    });
    const violations = findEmdashViolations(diff);
    expect(violations).toEqual([{ file: 'src/app.js', line: 22, match: EM_DASH }]);
  });
});

describe('findEmdashViolations: removed/context lines never reported', () => {
  it('reports zero violations when em dashes appear only on removed or context lines', () => {
    const diff = fileDiff({
      file: 'DESIGN.md',
      hunks: [
        {
          header: '@@ -1,2 +1,2 @@',
          body: [
            ` context line with ${EM_DASH} in it`,
            `-removed line with ${EM_DASH}`,
            `+added clean line`,
          ],
        },
      ],
    });
    expect(findEmdashViolations(diff)).toEqual([]);
  });
});

describe('findEmdashViolations: exemptions', () => {
  it('exempts a relocated line (added text also present as a removed line anywhere in the diff) while a genuinely new addition in the same diff still reports', () => {
    const carried = `const label = 'x${EM_DASH}y';`;
    const diff = diffOf(
      fileDiff({
        file: 'src/services/a.js',
        hunks: [{ header: '@@ -5,1 +5,0 @@', body: [`-  ${carried}`] }],
      }),
      fileDiff({
        file: 'src/services/b.js',
        hunks: [
          {
            header: '@@ -10,0 +10,2 @@',
            body: [`+  ${carried}`, `+  const fresh = 'p${EM_DASH}q';`],
          },
        ],
      })
    );
    const violations = findEmdashViolations(diff);
    expect(violations).toEqual([{ file: 'src/services/b.js', line: 11, match: EM_DASH }]);
  });

  it('reports an addition under a governance/ path, now that this repo declares no excluded-path carve-out: a regression guard against EXCLUDED_PATHS being re-widened later', () => {
    const diff = fileDiff({
      file: 'governance/anything.md',
      hunks: [{ header: '@@ -0,0 +1,1 @@', body: [`+archived note ${EM_DASH} kept as-is`] }],
    });
    const violations = findEmdashViolations(diff);
    expect(violations).toEqual([{ file: 'governance/anything.md', line: 1, match: EM_DASH }]);
  });
});

describe('findEmdashViolations: structural edges', () => {
  it('returns an empty array for an empty diff', () => {
    expect(findEmdashViolations('')).toEqual([]);
    expect(findEmdashViolations(undefined)).toEqual([]);
  });

  it('attributes an added violation to the NEW path on a renamed-file diff', () => {
    const diff = fileDiff({
      file: 'src/new-name.js',
      oldFile: 'src/old-name.js',
      header: ['similarity index 90%', 'rename from src/old-name.js', 'rename to src/new-name.js'],
      hunks: [
        { header: '@@ -1,1 +1,1 @@', body: [`-const s = 'old';`, `+const s = 'new ${EM_DASH}';`] },
      ],
    });
    const violations = findEmdashViolations(diff);
    expect(violations).toEqual([{ file: 'src/new-name.js', line: 1, match: EM_DASH }]);
  });
});

describe('findEmdashViolations: "\\ No newline at end of file" marker', () => {
  it('does not shift the reported new-file line number when a no-newline marker sits between a removed line and an added em-dash line', () => {
    const diff = fileDiff({
      file: 'src/app.js',
      hunks: [
        {
          header: '@@ -1,1 +1,1 @@',
          body: [
            `-const s = 'old';`,
            `${BACKSLASH} No newline at end of file`,
            `+const bad = 'x${EM_DASH}y';`,
          ],
        },
      ],
    });
    const violations = findEmdashViolations(diff);
    expect(violations).toEqual([{ file: 'src/app.js', line: 1, match: EM_DASH }]);
  });
});

describe('findEmdashViolations: hunk-body content that looks like a header', () => {
  it('an added line whose content starts with "++ " stays a hunk-body line, so a later violation in the same hunk still reports', () => {
    const diff = fileDiff({
      file: 'src/app.js',
      hunks: [
        {
          header: '@@ -1,0 +1,2 @@',
          body: [`+++ trap line, not a real file header`, `+const bad = 'x${EM_DASH}y';`],
        },
      ],
    });
    const violations = findEmdashViolations(diff);
    expect(violations).toEqual([{ file: 'src/app.js', line: 2, match: EM_DASH }]);
  });

  it('a removed line whose content starts with "--" enters the carry set, exempting its relocation, while a genuinely new addition in the same diff still reports', () => {
    const carried = `--legacy note ${EM_DASH} kept`;
    const diff = diffOf(
      fileDiff({
        file: 'src/services/a.js',
        hunks: [{ header: '@@ -5,1 +5,0 @@', body: [`-${carried}`] }],
      }),
      fileDiff({
        file: 'src/services/b.js',
        hunks: [
          {
            header: '@@ -10,0 +10,2 @@',
            body: [`+${carried}`, `+const fresh = 'p${EM_DASH}q';`],
          },
        ],
      })
    );
    const violations = findEmdashViolations(diff);
    expect(violations).toEqual([{ file: 'src/services/b.js', line: 11, match: EM_DASH }]);
  });
});

describe('hasRevertMarker', () => {
  it('accepts the canonical simple git revert body', () => {
    const body = `Revert "docs: rewrite section"\n\nThis reverts commit ${FULL_SHA_A}.\n`;
    expect(hasRevertMarker(body)).toBe(true);
  });

  it('accepts the merge-revert body form (marker plus ", reversing" continuation)', () => {
    const body = `Revert "Merge pull request #900"\n\nThis reverts commit ${FULL_SHA_A}, reversing\nchanges made to ${FULL_SHA_B}.\n`;
    expect(hasRevertMarker(body)).toBe(true);
  });

  it('rejects a body with no revert marker', () => {
    expect(hasRevertMarker('fix a typo in the README\n')).toBe(false);
  });

  it('rejects a marker with a short (non-40-hex) sha', () => {
    expect(hasRevertMarker(`This reverts commit ${SHORT_SHA}.\n`)).toBe(false);
  });

  it('treats missing/empty input as no marker', () => {
    expect(hasRevertMarker('')).toBe(false);
    expect(hasRevertMarker(undefined)).toBe(false);
  });
});

// CLI tests (architecture-review mandate carried over from the source repo):
// scripts/check-emdash.js invokes real git, so it is exercised against real
// scratch repos the same way tests/check-freshness.test.js exercises
// tools/check-freshness.ps1, rather than being excluded from coverage on the
// theory that git would be mocked away.
const GIT = 'git';

let gitMissing = false;
try {
  execFileSync(GIT, ['--version']);
} catch (e) {
  if (e.code === 'ENOENT') gitMissing = true;
}

const CLI_SCRIPT = path.join(__dirname, '..', 'scripts', 'check-emdash.js');

function git(cwd, args) {
  const r = spawnSync(GIT, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${r.stderr}`);
  }
  return r.stdout;
}

function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

// One repo with a single seed commit; tests advance HEAD past it and point
// EMDASH_BASE at baseSha directly, so no remote/origin setup is needed.
function makeCliRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emdash-cli-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'test']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  writeFile(dir, 'README.md', 'seed\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  const baseSha = git(dir, ['rev-parse', 'HEAD']).trim();
  return { dir, baseSha };
}

// A repo with no commit at all (an unborn HEAD): EMDASH_BASE is left unset
// here on purpose, since there is no commit for it to name.
function makeUnbornRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emdash-cli-unborn-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'test']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  return dir;
}

function runCli(cwd, env) {
  const r = spawnSync(process.execPath, [CLI_SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return {
    status: r.status === null ? 1 : r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

const maybeDescribe = gitMissing
  ? describe.skip.bind(describe, 'git not found -- skipping')
  : describe;

maybeDescribe('check-emdash.js CLI (real git)', () => {
  it('a commit adding an em-dash line yields exit 1 with file:line and the escape remedy', () => {
    const { dir, baseSha } = makeCliRepo();
    const emDash = String.fromCharCode(0x2014);
    writeFile(dir, 'src/app.js', `const s = 'wait${emDash} really';\n`);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'add a line']);

    const r = runCli(dir, { EMDASH_BASE: baseSha });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('src/app.js:1');
    const escapeHint = `${BACKSLASH}u2014`;
    expect(r.stdout).toContain(escapeHint);
  });

  it('an unresolvable EMDASH_BASE yields non-zero exit with the git error on stderr and nothing treated as clean', () => {
    const { dir } = makeCliRepo();

    const r = runCli(dir, { EMDASH_BASE: 'origin/does-not-exist' });
    expect(r.status).not.toBe(0);
    expect(r.stderr.length).toBeGreaterThan(0);
    expect(r.stdout).not.toContain('no added em dashes found');
  });

  it('a range whose commit message carries the canonical revert marker yields exit 0 with the revert notice and no diff evaluation', () => {
    const { dir, baseSha } = makeCliRepo();
    const emDash = String.fromCharCode(0x2014);
    writeFile(dir, 'src/app.js', `const s = 'wait${emDash} really';\n`);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', `Revert "x"\n\nThis reverts commit ${baseSha}.`]);

    const r = runCli(dir, { EMDASH_BASE: baseSha });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('revert');
    expect(r.stdout).not.toContain('src/app.js:1');
  });

  it('an unstaged tracked-file edit carrying an em dash yields exit 1 and names the file (AC1)', () => {
    const { dir, baseSha } = makeCliRepo();
    const emDash = String.fromCharCode(0x2014);
    expect(emDash.codePointAt(0)).toBe(0x2014);
    writeFile(dir, 'README.md', `seed${emDash} edited\n`);
    // Deliberately not staged: this must be visible to the working-tree scan.

    const r = runCli(dir, { EMDASH_BASE: baseSha });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('README.md:1');
  });

  it('a new untracked, non-gitignored file carrying an em dash yields exit 1 and names the file (AC2)', () => {
    const { dir, baseSha } = makeCliRepo();
    const emDash = String.fromCharCode(0x2014);
    expect(emDash.codePointAt(0)).toBe(0x2014);
    writeFile(dir, 'src/new-file.js', `const s = 'wait${emDash} really';\n`);
    // Deliberately not added to the index: this must be visible as untracked.

    const r = runCli(dir, { EMDASH_BASE: baseSha });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('src/new-file.js:1');
  });

  it('a single staged em-dash line with no other violation is reported exactly once (AC3)', () => {
    const { dir, baseSha } = makeCliRepo();
    const emDash = String.fromCharCode(0x2014);
    expect(emDash.codePointAt(0)).toBe(0x2014);
    writeFile(dir, 'src/app.js', `const s = 'wait${emDash} really';\n`);
    git(dir, ['add', '-A']);

    const r = runCli(dir, { EMDASH_BASE: baseSha });
    expect(r.status).toBe(1);
    const occurrences = r.stdout.split('src/app.js:1').length - 1;
    expect(occurrences).toBe(1);
    expect(r.stderr).toContain('check-emdash: 1 added em-dash line(s) found.');
  });

  it('a dirty working tree with an em-dash violation under a revert-marker commit range still yields exit 1 and names the dirty file (AC4)', () => {
    const { dir, baseSha } = makeCliRepo();
    const emDash = String.fromCharCode(0x2014);
    expect(emDash.codePointAt(0)).toBe(0x2014);
    // Committed range: a genuine revert, with no violation of its own.
    writeFile(dir, 'src/committed.js', 'const clean = 1;\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', `Revert "x"\n\nThis reverts commit ${baseSha}.`]);
    // Uncommitted, dirty working tree: the actual violation under test.
    writeFile(dir, 'README.md', `seed${emDash} edited\n`);

    const r = runCli(dir, { EMDASH_BASE: baseSha });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('revert');
    expect(r.stdout).toContain('README.md:1');
  });

  it('an untracked file under a gitignored path yields exit 0 and does not name the file (AC6)', () => {
    const { dir, baseSha } = makeCliRepo();
    const emDash = String.fromCharCode(0x2014);
    expect(emDash.codePointAt(0)).toBe(0x2014);
    writeFile(dir, '.gitignore', 'ignored/\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'add gitignore']);
    const ignoredSha = git(dir, ['rev-parse', 'HEAD']).trim();
    writeFile(dir, 'ignored/x.md', `archived note ${emDash} kept as-is\n`);

    const r = runCli(dir, { EMDASH_BASE: ignoredSha });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('check-emdash: no added em dashes found.');
    expect(r.stdout).not.toContain('ignored/x.md');
  });

  it('an untracked file with a non-ASCII name carrying an em dash yields exit 1 and reports the real file name, not a quoted/escaped form', () => {
    const { dir, baseSha } = makeCliRepo();
    const emDash = String.fromCharCode(0x2014);
    const eAcute = String.fromCharCode(0xe9);
    expect(emDash.codePointAt(0)).toBe(0x2014);
    expect(eAcute.codePointAt(0)).toBe(0xe9);
    const nonAsciiName = `caf${eAcute}.md`;
    writeFile(dir, nonAsciiName, `archived note ${emDash} kept${emDash}dash\n`);
    // Deliberately not added to the index: this is the untracked-scan path,
    // and core.quotePath defaults true, so git would otherwise hand this
    // path to the checker in escaped/quoted form ("caf\303\251.md").

    const r = runCli(dir, { EMDASH_BASE: baseSha });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`${nonAsciiName}:1`);
    expect(r.stdout).not.toContain('\\303\\251');
  });

  it('a tracked file with a non-ASCII name modified to carry an em dash reports the real file name, not a quoted/escaped diff-header form', () => {
    const { dir } = makeCliRepo();
    const emDash = String.fromCharCode(0x2014);
    const eAcute = String.fromCharCode(0xe9);
    expect(emDash.codePointAt(0)).toBe(0x2014);
    expect(eAcute.codePointAt(0)).toBe(0xe9);
    const nonAsciiName = `caf${eAcute}.md`;
    writeFile(dir, nonAsciiName, 'seed\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'add non-ascii file']);
    const trackedBaseSha = git(dir, ['rev-parse', 'HEAD']).trim();
    // Unstaged edit: this is the working-tree diff-header path, and git's
    // default core.quotePath=true would otherwise render this file's "+++"
    // header as a quoted, octal-escaped path that stripDiffPrefix's a/,b/
    // stripping cannot turn back into the real name.
    writeFile(dir, nonAsciiName, `seed${emDash} edited\n`);

    const r = runCli(dir, { EMDASH_BASE: trackedBaseSha });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`${nonAsciiName}:1`);
    expect(r.stdout).not.toContain('\\303\\251');
  });

  it('an unborn-HEAD repo with a file staged (git add, no commit) then edited on disk yields exit 1 and names the file', () => {
    const dir = makeUnbornRepo();
    const emDash = String.fromCharCode(0x2014);
    expect(emDash.codePointAt(0)).toBe(0x2014);
    writeFile(dir, 'a.txt', 'clean line\n');
    git(dir, ['add', 'a.txt']);
    // Edited on disk after staging, still with no commit ever made: `git
    // add` already made this file tracked, so it is invisible to the
    // untracked-file scan (`git ls-files --others --exclude-standard`
    // reports nothing for it) and must be caught by the unborn-HEAD
    // branch's own worktree-vs-index diff instead.
    writeFile(dir, 'a.txt', `edited${emDash}line\n`);

    const r = runCli(dir, {});
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('a.txt:1');
  });
});
