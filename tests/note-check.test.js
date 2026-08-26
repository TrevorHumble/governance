// tests/note-check.test.js
// Vitest tests for tools/note-check-core.ps1 (governance #46): the two
// mechanized note pre-checks (decline lookup, board covering-issue match)
// on the normalized one-line substance key. Launcher resolution is shared:
// see tests/ps-launcher.js.
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const REPO_ROOT = path.join(__dirname, '..');
const CORE_SCRIPT = path.join(REPO_ROOT, 'tools', 'note-check-core.ps1');

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('note-check'))
  : describe;

function runPs(expression) {
  const command = [
    `. '${CORE_SCRIPT}'`,
    `$__r = ${expression}`,
    `if ($null -eq $__r) { 'null' } else { ConvertTo-Json -InputObject $__r -Depth 6 -Compress }`,
  ].join('; ');
  const res = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(`powershell failed (${res.status}): ${res.stderr}`);
  }
  return JSON.parse(res.stdout.trim());
}

function jsonExpr(value) {
  const json = JSON.stringify(value).replace(/'/g, "''");
  return `(ConvertFrom-Json -InputObject '${json}')`;
}

maybeDescribe('ConvertTo-NormalizedSubstance', () => {
  test('case-folds, collapses whitespace, trims', () => {
    const r = runPs(`ConvertTo-NormalizedSubstance -Text '  Stale   Pointer in  README '`);
    expect(r).toBe('stale pointer in readme');
  });

  test('empty input stays empty', () => {
    const r = runPs(`ConvertTo-NormalizedSubstance -Text ''`);
    expect(r).toBe('');
  });
});

maybeDescribe('Test-DeclineMatch', () => {
  const declines = [
    '# Owner declines',
    'An item recorded here is never raised again.',
    '- YYYY-MM-DD - <normalized one-line substance> - <the owner answer>',
    '- 2026-08-26 - stale pointer in readme - leave it alone',
  ];

  test('a recorded decline suppresses a matching note, whatever its casing or spacing', () => {
    const r = runPs(
      `Test-DeclineMatch -DeclineLines ${jsonExpr(declines)} -Substance 'Stale  Pointer in README'`
    );
    expect(r).toBe(true);
  });

  test('a fragment of a recorded substance is NOT suppressed (exact equality, never containment)', () => {
    const r = runPs(`Test-DeclineMatch -DeclineLines ${jsonExpr(declines)} -Substance 'readme'`);
    expect(r).toBe(false);
  });

  test("the owner's answer text never suppresses a note", () => {
    const r = runPs(
      `Test-DeclineMatch -DeclineLines ${jsonExpr(declines)} -Substance 'leave it alone'`
    );
    expect(r).toBe(false);
  });

  test('a note with no recorded decline is not suppressed', () => {
    const r = runPs(
      `Test-DeclineMatch -DeclineLines ${jsonExpr(declines)} -Substance 'unbounded query in export route'`
    );
    expect(r).toBe(false);
  });

  test('header prose and the format template never suppress a note', () => {
    const a = runPs(
      `Test-DeclineMatch -DeclineLines ${jsonExpr(declines)} -Substance 'never raised again'`
    );
    const b = runPs(
      `Test-DeclineMatch -DeclineLines ${jsonExpr(declines)} -Substance '<normalized one-line substance>'`
    );
    expect(a).toBe(false);
    expect(b).toBe(false);
  });

  test('an empty substance matches nothing', () => {
    const r = runPs(`Test-DeclineMatch -DeclineLines ${jsonExpr(declines)} -Substance '   '`);
    expect(r).toBe(false);
  });

  test('a substance containing " - " still parses (greedy to the last separator)', () => {
    const withDash = declines.concat([
      '- 2026-08-26 - stale pointer - section 3 of readme - leave it alone',
    ]);
    const hit = runPs(
      `Test-DeclineMatch -DeclineLines ${jsonExpr(withDash)} -Substance 'stale pointer - section 3 of readme'`
    );
    const fragment = runPs(
      `Test-DeclineMatch -DeclineLines ${jsonExpr(withDash)} -Substance 'stale pointer'`
    );
    expect(hit).toBe(true);
    expect(fragment).toBe(false);
  });
});

maybeDescribe('Find-CoveringIssue', () => {
  const issues = [
    {
      Number: 45,
      Title: 'Let a run claim the files it is working on',
      Body: 'story text\nTouches: standards/issue-standards.md, tools/file-claim-core.ps1\nmore',
    },
    { Number: 50, Title: 'Fix the stale pointer in readme', Body: 'Touches: README.md' },
  ];

  test('an issue whose title equals the substance covers the note', () => {
    const r = runPs(
      `Find-CoveringIssue -Issues ${jsonExpr(issues)} -Substance 'Fix the stale POINTER  in readme'`
    );
    expect(r).toBe(50);
  });

  test('a substance that is only a fragment of a title is NOT covered by it', () => {
    const r = runPs(`Find-CoveringIssue -Issues ${jsonExpr(issues)} -Substance 'stale pointer'`);
    expect(r).toBeNull();
  });

  test('an issue whose Touches line names the file covers the note', () => {
    const r = runPs(
      `Find-CoveringIssue -Issues ${jsonExpr(issues)} -Substance 'tools/file-claim-core.ps1'`
    );
    expect(r).toBe(45);
  });

  test('body prose outside the Touches line never covers a note', () => {
    const r = runPs(`Find-CoveringIssue -Issues ${jsonExpr(issues)} -Substance 'story text'`);
    expect(r).toBeNull();
  });

  test('an uncovered note returns null', () => {
    const r = runPs(
      `Find-CoveringIssue -Issues ${jsonExpr(issues)} -Substance 'unbounded query in export route'`
    );
    expect(r).toBeNull();
  });
});
