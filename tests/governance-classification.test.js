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

function runGetSyncClassification(
  parentManifestObj,
  childManifestObjOrNull,
  planObj,
  parentRoot,
  childTrackedFilesOrUndefined
) {
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
  // undefined omits -ChildTrackedFiles entirely (the exception's own $null
  // default); an array, empty included, is passed through as literal
  // PowerShell strings so a caller can assert the "supplied but empty"
  // case (issue #53) separately from "not supplied at all".
  let childTrackedFilesArg = '';
  if (childTrackedFilesOrUndefined !== undefined) {
    const quoted = childTrackedFilesOrUndefined
      .map((p) => `'${String(p).replace(/'/g, "''")}'`)
      .join(', ');
    childTrackedFilesArg = ` -ChildTrackedFiles @(${quoted})`;
  }
  const cmd =
    `. '${CORE_SCRIPT}'; ` +
    `$pm = (Get-Content -Raw '${parentManifestPath}') | ConvertFrom-Json; ` +
    `$cm = ${childManifestExpr}; ` +
    `$pl = (Get-Content -Raw '${planPath}') | ConvertFrom-Json; ` +
    `try { $c = Get-SyncClassification -ParentManifest $pm -ChildManifest $cm -Plan $pl -ParentRoot '${parentRootArg}'${childTrackedFilesArg}; ` +
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

// issue #53: an additive, non-colliding manifest difference no longer forces
// the run to structure on its own. Every case below uses an empty plan (the
// manifest diff, not the plan content, is what each case exercises), so a
// content RunClass here means only "the manifest difference did not force
// structure," per Get-SyncClassification's own "the plan is empty; nothing
// to classify" reason on an empty plan.
function baseAdditiveManifest() {
  return {
    retired: [],
    sharedPaths: ['standards/**', 'tools/a.ps1'],
    excludedPaths: ['README.md'],
    classes: { 'standards/**': 'content', 'tools/a.ps1': 'content' },
    classesDefault: 'structure',
    arrivesAsStructure: [],
  };
}

function runAdditiveCase(parentManifest, childManifest, childTrackedFilesOrUndefined) {
  const parentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gclass-additive-parent-'));
  const r = runGetSyncClassification(
    parentManifest,
    childManifest,
    basePlan(),
    parentRoot,
    childTrackedFilesOrUndefined
  );
  expect(r.status).toBe(0);
  return parseClassification(r.stdout);
}

maybeDescribe('Test-IsAdditiveManifestDiff, via Get-SyncClassification (issue #53)', () => {
  it('additive with no collision classifies content', () => {
    const child = baseAdditiveManifest();
    const parent = Object.assign({}, child, {
      sharedPaths: child.sharedPaths.concat(['tools/new-file.ps1']),
    });
    const c = runAdditiveCase(parent, child, ['tools/a.ps1']);
    expect(c.RunClass).toBe('content');
  });

  it('additive where one added sharedPaths entry names a tracked child file classifies structure', () => {
    const child = baseAdditiveManifest();
    const parent = Object.assign({}, child, {
      sharedPaths: child.sharedPaths.concat(['tools/existing.ps1']),
    });
    const c = runAdditiveCase(parent, child, ['tools/existing.ps1']);
    expect(c.RunClass).toBe('structure');
    expect(c.RunReason).toContain('manifest fields differ');
  });

  it('additive where one added sharedPaths entry is a prefix/** glob over a directory the child already tracks files in classifies structure', () => {
    const child = baseAdditiveManifest();
    const parent = Object.assign({}, child, {
      sharedPaths: child.sharedPaths.concat(['docs/**']),
    });
    const c = runAdditiveCase(parent, child, ['docs/readme.md']);
    expect(c.RunClass).toBe('structure');
  });

  it('additive where one added classes key names a tracked child file classifies structure', () => {
    const child = baseAdditiveManifest();
    const parent = Object.assign({}, child, {
      classes: Object.assign({}, child.classes, { 'tools/existing.ps1': 'content' }),
    });
    const c = runAdditiveCase(parent, child, ['tools/existing.ps1']);
    expect(c.RunClass).toBe('structure');
  });

  it('a removal classifies structure', () => {
    const child = baseAdditiveManifest();
    const parent = Object.assign({}, child, {
      sharedPaths: child.sharedPaths.filter((p) => p !== 'tools/a.ps1'),
    });
    const c = runAdditiveCase(parent, child, []);
    expect(c.RunClass).toBe('structure');
  });

  it('a changed value on an existing entry classifies structure', () => {
    const child = baseAdditiveManifest();
    const parent = Object.assign({}, child, {
      classes: Object.assign({}, child.classes, { 'tools/a.ps1': 'structure' }),
    });
    const c = runAdditiveCase(parent, child, []);
    expect(c.RunClass).toBe('structure');
  });

  it('a classesDefault value change classifies structure', () => {
    const child = baseAdditiveManifest();
    const parent = Object.assign({}, child, { classesDefault: 'content' });
    const c = runAdditiveCase(parent, child, []);
    expect(c.RunClass).toBe('structure');
  });

  it('a classesDefault field present in the parent and absent in the child classifies structure', () => {
    const child = baseAdditiveManifest();
    delete child.classesDefault;
    const parent = baseAdditiveManifest();
    const c = runAdditiveCase(parent, child, []);
    expect(c.RunClass).toBe('structure');
  });

  it('an added retired entry classifies structure', () => {
    const child = baseAdditiveManifest();
    const parent = Object.assign({}, child, {
      retired: [{ path: 'legacy/gone.txt', sha256: 'a'.repeat(64) }],
    });
    const c = runAdditiveCase(parent, child, []);
    expect(c.RunClass).toBe('structure');
  });

  it('a plain added excludedPaths entry alone classifies content', () => {
    const child = baseAdditiveManifest();
    const parent = Object.assign({}, child, {
      excludedPaths: child.excludedPaths.concat(['newfile.md']),
    });
    const c = runAdditiveCase(parent, child, []);
    expect(c.RunClass).toBe('content');
  });

  it('an added !-prefixed excludedPaths entry classifies structure', () => {
    const child = baseAdditiveManifest();
    const parent = Object.assign({}, child, {
      excludedPaths: child.excludedPaths.concat(['!README.md']),
    });
    const c = runAdditiveCase(parent, child, []);
    expect(c.RunClass).toBe('structure');
  });

  // issue #53: excludedPaths is order-sensitive (isExcluded applies entries
  // in order, last match wins), so membership alone is not enough.
  it('a pure excludedPaths reorder that moves a ! entry across the entry it negates classifies structure', () => {
    const child = baseAdditiveManifest();
    child.excludedPaths = ['buildlog/**', '!buildlog/README.md'];
    const parent = Object.assign({}, child, {
      excludedPaths: ['!buildlog/README.md', 'buildlog/**'],
    });
    const c = runAdditiveCase(parent, child, []);
    expect(c.RunClass).toBe('structure');
  });

  it('a plain excludedPaths addition inserted before an existing ! entry classifies structure', () => {
    const child = baseAdditiveManifest();
    child.excludedPaths = ['buildlog/**', '!buildlog/README.md'];
    const parent = Object.assign({}, child, {
      excludedPaths: ['buildlog/**', 'newfile.md', '!buildlog/README.md'],
    });
    const c = runAdditiveCase(parent, child, []);
    expect(c.RunClass).toBe('structure');
  });

  it('a plain excludedPaths entry appended after an existing ! entry still classifies content', () => {
    const child = baseAdditiveManifest();
    child.excludedPaths = ['buildlog/**', '!buildlog/README.md'];
    const parent = Object.assign({}, child, {
      excludedPaths: ['buildlog/**', '!buildlog/README.md', 'newfile.md'],
    });
    const c = runAdditiveCase(parent, child, []);
    expect(c.RunClass).toBe('content');
  });

  // issue #53: the excludedPaths prefix comparison is ordinal, case-sensitive
  // (tools/governance-sync-core.ps1), so a case-only change reads as changed
  // rather than as an unqualified match. Without that, 'buildlog/**' and
  // 'Buildlog/**' would read as equal and the added 'newfile.md' entry would
  // pass through as a safe append.
  it('excludedPaths differing only by case classifies structure, not the added-tail append it would otherwise read as', () => {
    const child = baseAdditiveManifest();
    child.excludedPaths = ['buildlog/**'];
    const parent = Object.assign({}, child, {
      excludedPaths: ['Buildlog/**', 'newfile.md'],
    });
    const c = runAdditiveCase(parent, child, []);
    expect(c.RunClass).toBe('structure');
  });

  it('a supplied-but-empty child file list with a colliding-shaped addition classifies content (nothing tracked to collide with)', () => {
    const child = baseAdditiveManifest();
    const parent = Object.assign({}, child, {
      sharedPaths: child.sharedPaths.concat(['tools/would-collide.ps1']),
    });
    const c = runAdditiveCase(parent, child, []);
    expect(c.RunClass).toBe('content');
  });

  it('no child file list at all classifies structure', () => {
    const child = baseAdditiveManifest();
    const parent = Object.assign({}, child, {
      sharedPaths: child.sharedPaths.concat(['tools/would-collide.ps1']),
    });
    const c = runAdditiveCase(parent, child, undefined);
    expect(c.RunClass).toBe('structure');
  });

  // issue #53 regression guard: a zero-property PSCustomObject's
  // PSObject.Properties.Name enumerates as $null rather than an empty
  // collection, which used to read as one phantom removed classes key and
  // wrongly forced structure on a child manifest with no classes entries.
  it('a child manifest with an empty classes object and an added parent classes key, no collision, classifies content', () => {
    const child = baseAdditiveManifest();
    child.classes = {};
    const parent = Object.assign({}, child, {
      classes: { 'tools/new.ps1': 'content' },
    });
    const c = runAdditiveCase(parent, child, ['README.md']);
    expect(c.RunClass).toBe('content');
  });

  it('a child manifest with no classes property at all and an added parent classes key, no collision, classifies content', () => {
    const child = baseAdditiveManifest();
    delete child.classes;
    const parent = Object.assign({}, child, {
      classes: { 'tools/new.ps1': 'content' },
    });
    const c = runAdditiveCase(parent, child, ['README.md']);
    expect(c.RunClass).toBe('content');
  });
});
