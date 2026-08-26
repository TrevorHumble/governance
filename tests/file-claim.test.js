// tests/file-claim.test.js
// Vitest tests for tools/file-claim-core.ps1 (governance #45): the file
// claim and size rule defined in standards/issue-standards.md section "The
// file claim and the size rule". Pure decision cases only: label parsing,
// staleness, holder resolution, the four size-rule branches, and the
// double-claim tie-break. Launcher resolution is shared: see
// tests/ps-launcher.js.
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const REPO_ROOT = path.join(__dirname, '..');
const CORE_SCRIPT = path.join(REPO_ROOT, 'tools', 'file-claim-core.ps1');

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('file-claim'))
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
  const out = res.stdout.trim();
  return JSON.parse(out);
}

function issuesExpr(issues) {
  const json = JSON.stringify(issues).replace(/'/g, "''");
  return `(ConvertFrom-Json -InputObject '${json}')`;
}

const NOW =
  "([datetime]::SpecifyKind([datetime]::ParseExact('2026-08-26 06:00','yyyy-MM-dd HH:mm',$null),'Utc'))";

maybeDescribe('ConvertFrom-ActiveLabel', () => {
  test('parses a well-formed claim label into its issue number and UTC stamp', () => {
    const n = runPs(`(ConvertFrom-ActiveLabel -Label 'active-45-20260825-2310').IssueNumber`);
    expect(n).toBe(45);
    // Windows PowerShell 5.1's ConvertTo-Json emits /Date()/ for [datetime],
    // so the stamp is asserted via its round-trip 'o' format instead.
    const stamp = runPs(
      `(ConvertFrom-ActiveLabel -Label 'active-45-20260825-2310').Timestamp.ToUniversalTime().ToString('o')`
    );
    expect(stamp).toBe('2026-08-25T23:10:00.0000000Z');
  });

  for (const bad of [
    'active-45-20260825', // no time
    'active-20260825-2310', // no issue number
    'active-45-20261399-2310', // impossible date
    'active-45-20260825-2461', // impossible time
    'ready', // unrelated label
    'active-45-2026-08-25-2310', // separators inside the date
    '',
  ]) {
    test(`rejects malformed label ${JSON.stringify(bad)}`, () => {
      expect(runPs(`ConvertFrom-ActiveLabel -Label '${bad}'`)).toBeNull();
    });
  }
});

maybeDescribe('Test-ClaimStale', () => {
  test('a 35-hour-old claim is live, a 37-hour-old claim is stale', () => {
    const live = runPs(`Test-ClaimStale -Timestamp (${NOW}).AddHours(-35) -NowUtc ${NOW}`);
    const stale = runPs(`Test-ClaimStale -Timestamp (${NOW}).AddHours(-37) -NowUtc ${NOW}`);
    expect(live).toBe(false);
    expect(stale).toBe(true);
  });

  test('exactly 36 hours is not yet stale (the rule says more than 36)', () => {
    expect(runPs(`Test-ClaimStale -Timestamp (${NOW}).AddHours(-36) -NowUtc ${NOW}`)).toBe(false);
  });
});

maybeDescribe('ConvertFrom-TouchesLine', () => {
  test('splits on commas, trims backticks, drops "(new)" annotations', () => {
    const r = runPs(
      `ConvertFrom-TouchesLine -Value ' \`a/b.md\`, c/d.ps1, tests/x.test.js (new) '`
    );
    expect(r).toEqual(['a/b.md', 'c/d.ps1', 'tests/x.test.js']);
  });

  test('empty value yields an empty set', () => {
    const r = runPs(`@(ConvertFrom-TouchesLine -Value '')`);
    expect(r).toEqual([]);
  });

  test('backslash paths normalize to canonical git form', () => {
    const r = runPs(`ConvertFrom-TouchesLine -Value 'tools\\file-claim-core.ps1'`);
    expect(r).toBe('tools/file-claim-core.ps1');
  });
});

maybeDescribe('Get-FileHolder', () => {
  const issues = [
    {
      Number: 45,
      Labels: ['ready', 'active-45-20260826-0500'],
      Touches: ['standards/a.md', 'tools/t.ps1'],
    },
    { Number: 46, Labels: ['ready'], Touches: ['standards/b.md'] },
    { Number: 47, Labels: ['active-47-20260820-0500'], Touches: ['standards/c.md'] },
  ];

  test('a file on a live-claimed Touches line is held by that issue', () => {
    const r = runPs(
      `Get-FileHolder -Issues ${issuesExpr(issues)} -Path 'standards/a.md' -NowUtc ${NOW}`
    );
    expect(r).toBe(45);
  });

  test('a file on an unclaimed issue is free (Touches without a label grants no hold)', () => {
    const r = runPs(
      `Get-FileHolder -Issues ${issuesExpr(issues)} -Path 'standards/b.md' -NowUtc ${NOW}`
    );
    expect(r).toBeNull();
  });

  test('a stale claim grants no hold: the file has come free again', () => {
    const r = runPs(
      `Get-FileHolder -Issues ${issuesExpr(issues)} -Path 'standards/c.md' -NowUtc ${NOW}`
    );
    expect(r).toBeNull();
  });

  test('a file nobody names is free', () => {
    const r = runPs(
      `Get-FileHolder -Issues ${issuesExpr(issues)} -Path 'DESIGN.md' -NowUtc ${NOW}`
    );
    expect(r).toBeNull();
  });

  test('the acting run itself is excluded: its own claim is not "another run"', () => {
    const r = runPs(
      `Get-FileHolder -Issues ${issuesExpr(issues)} -Path 'standards/a.md' -NowUtc ${NOW} -ExcludeIssue 45`
    );
    expect(r).toBeNull();
  });

  test('a future-dated stamp grants no hold (a mis-zoned label cannot outlive its promise)', () => {
    const future = [
      { Number: 70, Labels: ['active-70-20260827-0600'], Touches: ['standards/f.md'] },
    ];
    const r = runPs(
      `Get-FileHolder -Issues ${issuesExpr(future)} -Path 'standards/f.md' -NowUtc ${NOW}`
    );
    expect(r).toBeNull();
  });

  test('a label whose embedded number belongs to a different issue grants no hold', () => {
    const mislabeled = [
      { Number: 50, Labels: ['active-45-20260826-0500'], Touches: ['standards/z.md'] },
    ];
    const r = runPs(
      `Get-FileHolder -Issues ${issuesExpr(mislabeled)} -Path 'standards/z.md' -NowUtc ${NOW}`
    );
    expect(r).toBeNull();
  });

  test('on a double-claim the yielder is skipped: the earlier claim is the holder', () => {
    const doubled = [
      { Number: 60, Labels: ['active-60-20260826-0400'], Touches: ['shared.md'] },
      { Number: 61, Labels: ['active-61-20260826-0500'], Touches: ['shared.md'] },
    ];
    const r = runPs(
      `Get-FileHolder -Issues ${issuesExpr(doubled)} -Path 'shared.md' -NowUtc ${NOW}`
    );
    expect(r).toBe(60);
  });
});

maybeDescribe('Resolve-SizeRuleBranch', () => {
  const cases = [
    // [size, held, branch]
    [10, true, 1], // ten lines, held: permitted, no claim
    [1, true, 1],
    [10, false, 2], // ten lines, free: permitted, claim recorded
    [3, false, 2],
    [11, false, 3], // large, free: claim first
    [500, false, 3],
    [11, true, 4], // large, held: wait
    [500, true, 4],
  ];
  for (const [size, held, branch] of cases) {
    test(`size ${size}, held ${held} -> branch ${branch}`, () => {
      const heldExpr = held ? '$true' : '$false';
      expect(runPs(`Resolve-SizeRuleBranch -ChangeSize ${size} -Held ${heldExpr}`)).toBe(branch);
    });
  }
});

maybeDescribe('Resolve-DoubleClaimYielder', () => {
  const claim = (n, stampExpr) =>
    `([pscustomobject]@{ IssueNumber = ${n}; Timestamp = ${stampExpr} })`;

  test('the later claim yields', () => {
    const r = runPs(
      `Resolve-DoubleClaimYielder -ClaimA ${claim(60, `(${NOW}).AddHours(-2)`)} -ClaimB ${claim(61, `(${NOW}).AddHours(-1)`)}`
    );
    expect(r).toBe(61);
  });

  test('order of arguments does not matter', () => {
    const r = runPs(
      `Resolve-DoubleClaimYielder -ClaimA ${claim(61, `(${NOW}).AddHours(-1)`)} -ClaimB ${claim(60, `(${NOW}).AddHours(-2)`)}`
    );
    expect(r).toBe(61);
  });

  test('on equal timestamps the higher issue number yields', () => {
    const r = runPs(
      `Resolve-DoubleClaimYielder -ClaimA ${claim(60, NOW)} -ClaimB ${claim(61, NOW)}`
    );
    expect(r).toBe(61);
  });
});
