// tests/governance-classification.test.js
// Vitest tests for Get-SyncClassification (tools/governance-sync-core.ps1),
// governance #14: classifies every path in a sync plan as content or
// structure and decides the run-level verdict. Pure-function cases only
// (AC3, AC5's per-file Files shape, AC6); the wrapper-level criteria (AC1,
// AC2, AC4, AC8) are covered end-to-end in tests/governance-sync.test.js,
// since the pure-function harness here cannot observe stdout markers, a PR
// that was not opened, or an issue count. Launcher resolution is shared: see
// tests/ps-launcher.js.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const REPO_ROOT = path.join(__dirname, '..');
const CORE_SCRIPT = path.join(REPO_ROOT, 'tools', 'governance-sync-core.ps1');

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('governance-classification'))
  : describe;

function toArray(v) {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function basePlan(overrides) {
  return Object.assign(
    {
      Adds: [],
      Updates: [],
      Prunes: [],
      RetainedDivergent: [],
      Warnings: [],
      IdenticalCount: 0,
    },
    overrides || {}
  );
}

function runGetSyncClassification(parentManifestObj, childManifestObjOrNull, planObj, parentRoot) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gclass-'));
  const parentManifestPath = path.join(dir, 'parent-manifest.json');
  fs.writeFileSync(parentManifestPath, JSON.stringify(parentManifestObj));
  let childManifestExpr = '$null';
  if (childManifestObjOrNull !== null) {
    const childManifestPath = path.join(dir, 'child-manifest.json');
    fs.writeFileSync(childManifestPath, JSON.stringify(childManifestObjOrNull));
    childManifestExpr = `((Get-Content -Raw '${childManifestPath}') | ConvertFrom-Json)`;
  }
  const planPath = path.join(dir, 'plan.json');
  fs.writeFileSync(planPath, JSON.stringify(planObj));
  const parentRootArg = String(parentRoot).replace(/'/g, "''");
  const cmd =
    `. '${CORE_SCRIPT}'; ` +
    `$pm = (Get-Content -Raw '${parentManifestPath}') | ConvertFrom-Json; ` +
    `$cm = ${childManifestExpr}; ` +
    `$pl = (Get-Content -Raw '${planPath}') | ConvertFrom-Json; ` +
    `try { $c = Get-SyncClassification -ParentManifest $pm -ChildManifest $cm -Plan $pl -ParentRoot '${parentRootArg}'; ` +
    `$c | ConvertTo-Json -Depth 8 -Compress } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 9 }`;
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], {
    encoding: 'utf8',
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

function parseClassification(raw) {
  const obj = JSON.parse(raw);
  return {
    Files: toArray(obj.Files).map((f) => ({ Path: f.Path, Class: f.Class, Reason: f.Reason })),
    RunClass: obj.RunClass,
    RunReason: obj.RunReason,
    Withheld: toArray(obj.Withheld),
    Shipped: toArray(obj.Shipped),
    OpensPr: obj.OpensPr,
  };
}

maybeDescribe('Get-SyncClassification (AC3, AC5, AC6)', () => {
  it('AC3: an arrivesAsStructure Add and a non-content classes value both return structure and land in Withheld, not Shipped', () => {
    const manifest = {
      classes: { 'tools/needs-review.ps1': 'needs-review' },
      classesDefault: 'content',
      arrivesAsStructure: ['standards/ownership-map.md'],
    };
    const plan = basePlan({
      Adds: ['standards/ownership-map.md'],
      Updates: ['tools/needs-review.ps1'],
    });
    const parentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gclass-parent-'));
    fs.writeFileSync(path.join(parentRoot, 'placeholder.txt'), 'unrelated\n');

    const r = runGetSyncClassification(manifest, manifest, plan, parentRoot);
    expect(r.status).toBe(0);
    const c = parseClassification(r.stdout);

    const arrivesFile = c.Files.find((f) => f.Path === 'standards/ownership-map.md');
    const classesFile = c.Files.find((f) => f.Path === 'tools/needs-review.ps1');
    expect(arrivesFile.Class).toBe('structure');
    expect(classesFile.Class).toBe('structure');
    expect(c.Withheld).toEqual(
      expect.arrayContaining(['standards/ownership-map.md', 'tools/needs-review.ps1'])
    );
    expect(c.Shipped).not.toContain('standards/ownership-map.md');
    expect(c.Shipped).not.toContain('tools/needs-review.ps1');
  });

  it('AC5: every Files entry carries a non-empty Path, a Class of content or structure, and a non-empty Reason', () => {
    const manifest = {
      classes: { 'tools/a.ps1': 'content', 'tools/b.ps1': 'structure' },
      classesDefault: 'structure',
      arrivesAsStructure: [],
    };
    const plan = basePlan({
      Adds: ['tools/a.ps1'],
      Updates: ['tools/b.ps1', 'tools/unclassified.ps1'],
      Prunes: ['legacy/gone.txt'],
    });
    const parentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gclass-parent-'));
    fs.writeFileSync(path.join(parentRoot, 'a.ps1'), 'content\n');

    const r = runGetSyncClassification(manifest, manifest, plan, parentRoot);
    expect(r.status).toBe(0);
    const c = parseClassification(r.stdout);

    expect(c.Files).toHaveLength(4);
    for (const f of c.Files) {
      expect(typeof f.Path).toBe('string');
      expect(f.Path.length).toBeGreaterThan(0);
      expect(['content', 'structure']).toContain(f.Class);
      expect(typeof f.Reason).toBe('string');
      expect(f.Reason.length).toBeGreaterThan(0);
    }
  });

  it('AC6: an absent child manifest is no diff (content run) and a Prune classifies content and ships, with no read of the parent tree', () => {
    const manifest = {
      classes: {},
      classesDefault: 'structure',
      arrivesAsStructure: [],
    };
    const plan = basePlan({ Prunes: ['legacy/old.txt'] });
    // A nonexistent parent root: rule 0 never reads it, so a clean run alone
    // does not prove that; the assertions below are the actual check.
    const nonexistentParentRoot = path.join(os.tmpdir(), 'gclass-does-not-exist-' + Date.now());

    const r = runGetSyncClassification(manifest, null, plan, nonexistentParentRoot);
    expect(r.status).toBe(0);
    const c = parseClassification(r.stdout);

    expect(c.RunClass).toBe('content');
    const pruneFile = c.Files.find((f) => f.Path === 'legacy/old.txt');
    expect(pruneFile.Class).toBe('content');
    expect(c.Shipped).toEqual(['legacy/old.txt']);
    expect(c.Withheld).toEqual([]);
  });

  it('a numeric, array, or null classes/classesDefault value lands on structure (Test-IsContentLiteral guard), never crashes', () => {
    const manifest = {
      classes: { 'tools/numeric.ps1': 5, 'tools/arr.ps1': ['content'] },
      classesDefault: null,
      arrivesAsStructure: [],
    };
    const plan = basePlan({
      Updates: ['tools/numeric.ps1', 'tools/arr.ps1', 'tools/unmatched.ps1'],
    });
    const parentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gclass-parent-'));

    const r = runGetSyncClassification(manifest, manifest, plan, parentRoot);
    expect(r.status).toBe(0);
    const c = parseClassification(r.stdout);

    const numericFile = c.Files.find((f) => f.Path === 'tools/numeric.ps1');
    const arrFile = c.Files.find((f) => f.Path === 'tools/arr.ps1');
    const unmatchedFile = c.Files.find((f) => f.Path === 'tools/unmatched.ps1');
    expect(numericFile.Class).toBe('structure');
    expect(arrFile.Class).toBe('structure');
    expect(unmatchedFile.Class).toBe('structure');
    expect(c.Withheld).toEqual(
      expect.arrayContaining(['tools/numeric.ps1', 'tools/arr.ps1', 'tools/unmatched.ps1'])
    );
  });
});
