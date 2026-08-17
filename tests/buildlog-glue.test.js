// tests/buildlog-glue.test.js
// Vitest tests for the buildlog fragment glue: scripts/buildlog-glue-core.js
// directly, and scripts/buildlog-glue.js's main() driven in-process against
// real temp fixtures. Ported from TrevorHumble/wedding-scavenger-hunt (issue
// #1184); see that repo's DESIGN.md, "buildlog fragments: one file per
// shipped issue, folded into BUILDLOG.md on demand", for full rationale.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const prettier = require('prettier');
const { foldFragments, verifyFolded } = require('../scripts/buildlog-glue-core');
const { main } = require('../scripts/buildlog-glue');

const EOL = '\r\n';

/** Joins lines with CRLF and adds exactly one trailing terminator. */
function crlfArchive(lines) {
  return lines.concat('').join(EOL);
}

/** A shape-valid entry line comfortably over the 200-character default floor. */
function longEntry(date, issueNumber, prNumber, tag) {
  const padding = 'x'.repeat(120);
  return (
    `- ${date} - #${issueNumber} ${tag}: a fold-test entry padded well past the two hundred ` +
    `character floor so only the rule under test can trip, filler ${padding} ` +
    `(PR #${prNumber}). evidence: exercised by tests/buildlog-glue.test.js.`
  );
}

/** A shape-valid entry line well under the 200-character default floor. */
function shortEntry(date, issueNumber, prNumber, tag) {
  return `- ${date} - #${issueNumber} ${tag} (PR #${prNumber}). ok`;
}

describe('foldFragments: ordering', () => {
  it('orders by date then numeric issue then numeric PR', () => {
    const archive = crlfArchive(['# Build Log', '', 'Seed content.']);
    const fragments = [
      { name: '20-99.md', text: shortEntry('2026-08-11', 20, 99, 'twenty-late') },
      { name: '9-50.md', text: shortEntry('2026-08-11', 9, 50, 'nine') },
      { name: '4-10.md', text: shortEntry('2026-08-01', 4, 10, 'four') },
      { name: '20-40.md', text: shortEntry('2026-08-11', 20, 40, 'twenty-early') },
    ];

    const result = foldFragments(archive, fragments, { minEntryLength: 0 });

    expect(result.consumed.map((c) => c.name)).toEqual([
      '4-10.md',
      '9-50.md',
      '20-40.md',
      '20-99.md',
    ]);
  });
});

describe('foldFragments: append-only composition', () => {
  it('preserves existing archive bytes as a prefix', () => {
    const archive = crlfArchive([
      '# Build Log',
      '',
      'Existing archive content, untouched by a fold.',
    ]);
    const entry = longEntry('2026-08-12', 12, 34, 'prefix-check');

    const result = foldFragments(archive, [{ name: '12-34.md', text: entry }]);

    expect(result.text.startsWith(archive)).toBe(true);
    expect(result.text).toBe(archive + EOL + entry + EOL);
  });

  it('separates each appended entry by one blank line and ends with exactly one terminator', () => {
    const archive = crlfArchive(['# Build Log', '', 'Seed content.']);
    const entryA = longEntry('2026-08-12', 12, 34, 'first');
    const entryB = longEntry('2026-08-12', 13, 35, 'second');

    const result = foldFragments(archive, [
      { name: '12-34.md', text: entryA },
      { name: '13-35.md', text: entryB },
    ]);

    const lines = result.text.split(EOL);
    expect(lines.slice(-6)).toEqual(['Seed content.', '', entryA, '', entryB, '']);
    expect(lines[lines.length - 1]).toBe('');
    expect(result.text.endsWith(EOL + EOL)).toBe(false);
  });

  it('strips a trailing blank line from a fragment before appending, avoiding a double terminator', () => {
    const archive = crlfArchive(['# Build Log', '', 'Seed content.']);
    const entry = longEntry('2026-08-12', 12, 34, 'trailing-blank-line');
    // The fragment's own text ends in a blank line before its file terminator.
    const fragmentText = `${entry}${EOL}${EOL}`;

    const result = foldFragments(archive, [{ name: '12-34.md', text: fragmentText }]);

    expect(result.text).toBe(archive + EOL + entry + EOL);
    expect(result.text.endsWith(EOL + EOL)).toBe(false);
  });
});

describe('foldFragments: out-of-order warning', () => {
  it('reports a fragment dated before the archive tail in outOfOrder and still consumes it', () => {
    const tailEntry = longEntry('2026-08-10', 1, 2, 'tail');
    const archive = crlfArchive(['# Build Log', '', tailEntry]);
    const earlyEntry = longEntry('2026-08-05', 5, 6, 'earlier-than-tail');

    const result = foldFragments(archive, [{ name: '5-6.md', text: earlyEntry }]);

    expect(result.outOfOrder).toEqual(['5-6.md']);
    expect(result.consumed).toEqual([{ name: '5-6.md', text: earlyEntry, appended: true }]);
  });
});

describe('foldFragments: rejection rules', () => {
  it('rejects each of shape, filename, number-mismatch, duplicate, stub with that rule', () => {
    const existingDuplicateLine = longEntry('2026-08-01', 8, 8, 'existing-in-archive');
    const archive = crlfArchive(['# Build Log', '', existingDuplicateLine]);

    const fragments = [
      {
        name: '5-5.md',
        text:
          'Not a buildlog entry line at all, missing the required dash-date-hash-summary-PR ' +
          'shape entirely and quite deliberately so, to trip the shape rule reliably here.',
      },
      { name: 'not-a-valid-name.md', text: longEntry('2026-08-11', 6, 6, 'bad-filename') },
      { name: '6-6.md', text: longEntry('2026-08-11', 7, 6, 'wrong-issue-number') },
      {
        name: '8-8.md',
        text: `${existingDuplicateLine}\nA second line with content not present anywhere in the archive.`,
      },
      { name: '10-10.md', text: shortEntry('2026-08-11', 10, 11, 'too-short') },
    ];

    const result = foldFragments(archive, fragments);

    const byName = new Map(result.rejected.map((r) => [r.name, r.rule]));
    expect(byName.get('5-5.md')).toBe('shape');
    expect(byName.get('not-a-valid-name.md')).toBe('filename');
    expect(byName.get('6-6.md')).toBe('number-mismatch');
    expect(byName.get('8-8.md')).toBe('duplicate');
    expect(byName.get('10-10.md')).toBe('stub');
    expect(result.rejected).toHaveLength(5);
    expect(result.consumed).toEqual([]);
    expect(result.text).toBe(archive);
  });
});

describe('foldFragments: duplicate suppression', () => {
  it('consumes a full duplicate carrying its text, and verifyFolded clears it against the real bytes', () => {
    const existingLine = longEntry('2026-08-01', 8, 8, 'already-folded');
    const archive = crlfArchive(['# Build Log', '', existingLine]);

    const result = foldFragments(archive, [{ name: '8-8.md', text: existingLine }]);

    expect(result.consumed).toEqual([{ name: '8-8.md', text: existingLine, appended: false }]);
    expect(result.rejected).toEqual([]);
    expect(result.text).toBe(archive);

    const { deletable, missing } = verifyFolded(result.text, result.consumed);
    expect(deletable).toEqual(['8-8.md']);
    expect(missing).toEqual([]);
  });

  it('a suppressed full duplicate is NOT cleared when its lines are absent from the re-read bytes', () => {
    // Guards the fix for the blind-delete defect: an empty-text consumed
    // entry used to skip verification entirely. A duplicate's lines are
    // always in the archive in practice (that is what makes it a duplicate),
    // but verifyFolded itself must not special-case an empty text -- it must
    // check every consumed entry's lines against what was actually read
    // back, with no exemption.
    const existingLine = longEntry('2026-08-01', 8, 8, 'already-folded');
    const consumed = [{ name: '8-8.md', text: existingLine, appended: false }];

    const { deletable, missing } = verifyFolded(
      '# Build Log\r\n\r\nsomething else entirely\r\n',
      consumed
    );

    expect(deletable).toEqual([]);
    expect(missing).toEqual(['8-8.md']);
  });

  it('suppresses a duplicate against another fragment in the same fold', () => {
    const archive = crlfArchive(['# Build Log', '', 'Seed content.']);
    const sharedEntry = longEntry('2026-08-11', 11, 11, 'shared-between-two-fragments');

    const result = foldFragments(archive, [
      { name: '11-11.md', text: sharedEntry },
      { name: '11-12.md', text: sharedEntry },
    ]);

    expect(result.consumed).toEqual([
      { name: '11-11.md', text: sharedEntry, appended: true },
      { name: '11-12.md', text: sharedEntry, appended: false },
    ]);
    expect(result.text).toBe(archive + EOL + sharedEntry + EOL);
  });
});

describe('verifyFolded', () => {
  it('clears only when every line of a consumed entry is present as a consecutive run', () => {
    const entry = 'entry line one\r\nentry line two continuation';
    const archive = crlfArchive([
      '# Build Log',
      '',
      'entry line one',
      'entry line two continuation',
    ]);

    const { deletable, missing } = verifyFolded(archive, [{ name: 'ok.md', text: entry }]);

    expect(deletable).toEqual(['ok.md']);
    expect(missing).toEqual([]);
  });

  it('never clears an empty-text entry, even against an archive containing a blank line', () => {
    // An empty needle would match any haystack containing a blank line -- not
    // a real check. This guards that a consumed entry with no real text can
    // never be waved through as "present" just because the archive happens
    // to have a blank line somewhere.
    const archive = crlfArchive(['# Build Log', '', 'Seed content.']);

    const { deletable, missing } = verifyFolded(archive, [{ name: 'empty.md', text: '' }]);

    expect(deletable).toEqual([]);
    expect(missing).toEqual(['empty.md']);
  });

  it('clears a healthy sibling and names the offender when one line is missing', () => {
    const goodEntry = 'present line one\r\npresent line two';
    const badEntry = 'present line one\r\na line that was never written to the archive';
    const archive = crlfArchive(['# Build Log', '', 'present line one', 'present line two']);

    const { deletable, missing } = verifyFolded(archive, [
      { name: 'good.md', text: goodEntry },
      { name: 'bad.md', text: badEntry },
    ]);

    expect(deletable).toEqual(['good.md']);
    expect(missing).toEqual(['bad.md']);
  });
});

// main() CLI tests: real temp fixtures on disk, driven in-process per
// scripts/buildlog-glue.js's contract (never assigns process.exitCode /
// calls process.exit itself).
function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildlog-glue-'));
  const fragmentsDir = path.join(root, 'buildlog');
  fs.mkdirSync(fragmentsDir);
  const archivePath = path.join(root, 'BUILDLOG.md');
  fs.writeFileSync(fragmentsDir + path.sep + 'README.md', 'Fragment folder contract.\n', 'utf8');
  return { root, fragmentsDir, archivePath };
}

function writeFragment(fragmentsDir, name, text) {
  fs.writeFileSync(path.join(fragmentsDir, name), `${text}\n`, 'utf8');
}

describe('main', () => {
  it('folds, deletes the fragment, leaves README, and leaves the archive prettier-clean', async () => {
    const { fragmentsDir, archivePath } = makeFixture();
    const archive = crlfArchive(['# Build Log', '', 'Seed content.']);
    fs.writeFileSync(archivePath, archive, 'utf8');
    const entry = longEntry('2026-08-12', 12, 34, 'main-success');
    writeFragment(fragmentsDir, '12-34.md', entry);

    const result = main({ fragmentsDir, archivePath });

    expect(result.code).toBe(0);
    expect(result.message).toContain('12-34.md');
    expect(fs.existsSync(path.join(fragmentsDir, '12-34.md'))).toBe(false);
    expect(fs.existsSync(path.join(fragmentsDir, 'README.md'))).toBe(true);

    const written = fs.readFileSync(archivePath, 'utf8');
    expect(written).toBe(archive + EOL + entry + EOL);

    const cfg = await prettier.resolveConfig(path.join(__dirname, '..', 'BUILDLOG.md'));
    const ok = await prettier.check(written, { ...cfg, filepath: 'BUILDLOG.md' });
    expect(ok).toBe(true);
  });

  it('returns nothing to fold and does not touch the archive when only README is present', () => {
    const { fragmentsDir, archivePath } = makeFixture();
    const archive = crlfArchive(['# Build Log', '', 'Seed content.']);
    fs.writeFileSync(archivePath, archive, 'utf8');

    const result = main({ fragmentsDir, archivePath });

    expect(result).toEqual({ code: 0, message: 'nothing to fold', rejected: [] });
    expect(fs.readFileSync(archivePath, 'utf8')).toBe(archive);
  });

  it('on a failed read-back returns non-zero, names the fragment, restores the archive bytes, and deletes nothing', () => {
    const { fragmentsDir, archivePath } = makeFixture();
    const archive = crlfArchive(['# Build Log', '', 'Seed content.']);
    fs.writeFileSync(archivePath, archive, 'utf8');
    const entry = longEntry('2026-08-12', 12, 34, 'readback-failure');
    writeFragment(fragmentsDir, '12-34.md', entry);

    // Simulates a stale/corrupted re-read: returns the pre-append bytes, so
    // the just-appended entry is reported missing from "what's on disk".
    const staleReadBack = () => archive;

    const result = main({ fragmentsDir, archivePath, readBack: staleReadBack });

    expect(result.code).not.toBe(0);
    expect(result.message).toContain('12-34.md');
    expect(fs.readFileSync(archivePath, 'utf8')).toBe(archive);
    expect(fs.existsSync(path.join(fragmentsDir, '12-34.md'))).toBe(true);
  });

  it('returns non-zero and touches nothing when every fragment is refused', () => {
    const { fragmentsDir, archivePath } = makeFixture();
    const archive = crlfArchive(['# Build Log', '', 'Seed content.']);
    fs.writeFileSync(archivePath, archive, 'utf8');
    writeFragment(fragmentsDir, '10-10.md', shortEntry('2026-08-11', 10, 10, 'stub'));

    const result = main({ fragmentsDir, archivePath });

    expect(result.code).not.toBe(0);
    expect(result.rejected).toEqual([{ name: '10-10.md', rule: 'stub' }]);
    expect(fs.readFileSync(archivePath, 'utf8')).toBe(archive);
    expect(fs.existsSync(path.join(fragmentsDir, '10-10.md'))).toBe(true);
  });

  it('prints an out-of-order fragment as a warning and still folds, deletes it, and returns zero', () => {
    const { fragmentsDir, archivePath } = makeFixture();
    const tailEntry = longEntry('2026-08-10', 1, 2, 'tail');
    const archive = crlfArchive(['# Build Log', '', tailEntry]);
    fs.writeFileSync(archivePath, archive, 'utf8');
    const earlyEntry = longEntry('2026-08-05', 5, 6, 'earlier-than-tail');
    writeFragment(fragmentsDir, '5-6.md', earlyEntry);

    const result = main({ fragmentsDir, archivePath });

    expect(result.code).toBe(0);
    expect(result.message).toContain('out-of-order');
    expect(result.message).toContain('5-6.md');
    expect(fs.existsSync(path.join(fragmentsDir, '5-6.md'))).toBe(false);
    expect(fs.readFileSync(archivePath, 'utf8')).toBe(archive + EOL + earlyEntry + EOL);
  });

  it('returns an error naming the archive path when the archive cannot be read', () => {
    const { fragmentsDir } = makeFixture();
    writeFragment(fragmentsDir, '12-34.md', longEntry('2026-08-12', 12, 34, 'missing-archive'));
    const missingArchivePath = path.join(fragmentsDir, 'does-not-exist.md');

    const result = main({ fragmentsDir, archivePath: missingArchivePath });

    expect(result.code).not.toBe(0);
    expect(result.message).toContain('does-not-exist.md');
    expect(fs.existsSync(path.join(fragmentsDir, '12-34.md'))).toBe(true);
  });

  it('names the fragment when it cannot be deleted after a verified fold', () => {
    const { fragmentsDir, archivePath } = makeFixture();
    const archive = crlfArchive(['# Build Log', '', 'Seed content.']);
    fs.writeFileSync(archivePath, archive, 'utf8');
    const entry = longEntry('2026-08-12', 12, 34, 'unlink-failure');
    writeFragment(fragmentsDir, '12-34.md', entry);

    // The only pending fragment in this fixture is 12-34.md, so a
    // non-discriminating throw here exercises exactly the deletion this
    // test targets without touching any other file.
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('EPERM: locked');
    });

    try {
      const result = main({ fragmentsDir, archivePath });

      expect(result.code).not.toBe(0);
      expect(result.message).toContain('12-34.md');
      expect(fs.readFileSync(archivePath, 'utf8')).toBe(archive + EOL + entry + EOL);
    } finally {
      unlinkSpy.mockRestore();
    }
  });

  it('reports a restore as unverified, distinct from a confirmed restore, when the restored bytes cannot be confirmed', () => {
    const { fragmentsDir, archivePath } = makeFixture();
    const archive = crlfArchive(['# Build Log', '', 'Seed content.']);
    fs.writeFileSync(archivePath, archive, 'utf8');
    const entry = longEntry('2026-08-12', 12, 34, 'restore-unverified');
    writeFragment(fragmentsDir, '12-34.md', entry);

    let call = 0;
    // 1st read-back: the post-append verify -- report the append missing, so
    // main() attempts a restore. 2nd read-back: the post-restore verify --
    // report bytes that do not match what was just restored, simulating a
    // restore write that did not actually land either.
    const flakyReadBack = () => {
      call += 1;
      return call === 1 ? archive : `${archive}CORRUPTED`;
    };

    const result = main({ fragmentsDir, archivePath, readBack: flakyReadBack });

    expect(result.code).not.toBe(0);
    expect(result.message).toContain('12-34.md');
    expect(result.message.toLowerCase()).toContain('unverified');
    expect(result.message.toLowerCase()).toContain('do not commit');
    expect(fs.existsSync(path.join(fragmentsDir, '12-34.md'))).toBe(true);
  });
});
