// scripts/buildlog-glue-core.js
// Pure fold/verify logic for the buildlog fragment glue; no process,
// filesystem, or git access here. See buildlog/README.md for the full
// fragment contract this enforces. (Ported from the wedding-scavenger-hunt
// repo's issue #1184.)
'use strict';

// First-line shape a fragment entry must match; see buildlog/README.md for
// the full contract this enforces, including why the PR number comes from
// the filename, not group 2.
const LINE_SHAPE = /^- (\d{4}-\d{2}-\d{2}) - #(\d+) .+\(PR #\d+\)\.\s+\S.*$/;

// buildlog/<N>-<PR>.md -- both components plain digit runs.
const FILENAME_SHAPE = /^(\d+)-(\d+)\.md$/;

// The last `- YYYY-MM-DD` line in the pre-fold archive text, used only to
// flag a fragment whose own date is earlier (a warning, not a rejection).
const ENTRY_DATE_LINE = /^- (\d{4}-\d{2}-\d{2})/;

/** Splits text on any line terminator, LF or CRLF; result lines carry no `\r`. */
function splitLines(text) {
  return String(text).split(/\r?\n/);
}

/** Strips exactly one trailing `\r\n` or `\n`, never more. */
function stripTrailingNewline(text) {
  return String(text).replace(/\r?\n$/, '');
}

/**
 * True when `needle` (an array of lines) appears in `haystack` as a
 * contiguous, in-order run. An empty `needle` never matches.
 * @param {string[]} haystack
 * @param {string[]} needle
 * @returns {boolean}
 */
function containsConsecutiveLines(haystack, needle) {
  if (needle.length === 0) return false;
  const limit = haystack.length - needle.length;
  outer: for (let i = 0; i <= limit; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** The date on the last `- YYYY-MM-DD` line of `archiveText`, or null if none. */
function findLastEntryDate(archiveText) {
  let last = null;
  for (const line of splitLines(archiveText)) {
    const m = ENTRY_DATE_LINE.exec(line);
    if (m) last = m[1];
  }
  return last;
}

/**
 * Appends one fold entry to `archiveText`, separated from the preceding text
 * by exactly one blank line, and ending with exactly one terminator.
 * @param {string} archiveText
 * @param {string} entryText normalized fragment text (no trailing terminator
 *   and no trailing blank lines)
 * @param {string} eol '\r\n' or '\n'
 * @returns {string}
 */
function appendEntry(archiveText, entryText, eol) {
  const base = stripTrailingNewline(archiveText);
  const entryLines = entryText.split(/\r?\n/);
  return base + eol + eol + entryLines.join(eol) + eol;
}

/**
 * Folds pending fragments onto an existing archive; see buildlog/README.md
 * for the full contract this enforces.
 * @param {string} archiveText the current archive contents, any EOL style
 * @param {{name: string, text: string}[]} fragments pending fragment files
 * @param {{minEntryLength?: number}} [options]
 * @returns {{
 *   text: string,
 *   consumed: {name: string, text: string, appended: boolean}[],
 *   rejected: {name: string, rule: 'shape'|'filename'|'number-mismatch'|'duplicate'|'stub'}[],
 *   outOfOrder: string[],
 * }}
 */
function foldFragments(archiveText, fragments, options = {}) {
  const minEntryLength = options.minEntryLength === undefined ? 200 : options.minEntryLength;
  const eol = String(archiveText).includes('\r\n') ? '\r\n' : '\n';
  const lastArchiveDate = findLastEntryDate(archiveText);

  const rejected = [];
  const candidates = [];

  for (const fragment of fragments) {
    const name = fragment.name;
    const rawText = stripTrailingNewline(fragment.text);

    const filenameMatch = FILENAME_SHAPE.exec(name);
    if (!filenameMatch) {
      rejected.push({ name, rule: 'filename' });
      continue;
    }

    // Trailing blank lines are stripped here, not just the one trailing
    // terminator above: an entry whose source has a blank line before EOF
    // would otherwise leave the archive ending in two terminators, which
    // fails `prettier --check` on the folded file.
    const lines = splitLines(rawText);
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const text = lines.join('\n');

    const firstLine = lines[0] || '';
    const shapeMatch = LINE_SHAPE.exec(firstLine);
    if (!shapeMatch) {
      rejected.push({ name, rule: 'shape' });
      continue;
    }

    const lineIssueNumber = Number(shapeMatch[2]);
    const filenameIssueNumber = Number(filenameMatch[1]);
    if (lineIssueNumber !== filenameIssueNumber) {
      rejected.push({ name, rule: 'number-mismatch' });
      continue;
    }

    if (firstLine.length < minEntryLength) {
      rejected.push({ name, rule: 'stub' });
      continue;
    }

    candidates.push({
      name,
      text,
      lines,
      dateStr: shapeMatch[1],
      issueNumber: lineIssueNumber,
      prNumber: Number(filenameMatch[2]),
    });
  }

  candidates.sort(
    (a, b) =>
      a.dateStr.localeCompare(b.dateStr) || a.issueNumber - b.issueNumber || a.prNumber - b.prNumber
  );

  let resultText = archiveText;
  const consumed = [];
  const outOfOrder = [];

  for (const candidate of candidates) {
    const composedLines = splitLines(resultText);

    if (containsConsecutiveLines(composedLines, candidate.lines)) {
      // Already present in full -- already folded, not an error. Carries its
      // full text (not appended this fold) so verifyFolded checks it the
      // same way as any other consumed entry: against what is actually on
      // disk, not against an assumption that "already there" needs no check.
      consumed.push({ name: candidate.name, text: candidate.text, appended: false });
      continue;
    }

    if (candidate.lines.length >= 2 && composedLines.includes(candidate.lines[0])) {
      // First line already logged, body is not: a genuine conflict, not an
      // idempotent re-run.
      rejected.push({ name: candidate.name, rule: 'duplicate' });
      continue;
    }

    resultText = appendEntry(resultText, candidate.text, eol);
    consumed.push({ name: candidate.name, text: candidate.text, appended: true });
    if (lastArchiveDate !== null && candidate.dateStr < lastArchiveDate) {
      outOfOrder.push(candidate.name);
    }
  }

  return { text: resultText, consumed, rejected, outOfOrder };
}

/**
 * Confirms every consumed fragment's text is present in the written archive
 * text as a consecutive run of whole lines -- appended this fold or already
 * there, the check is the same either way, so a blind delete never happens.
 * See buildlog/README.md for the full fragment contract this enforces.
 * @param {string} text the archive text as actually read back from disk
 * @param {{name: string, text: string, appended: boolean}[]} consumed foldFragments' `consumed`
 * @returns {{deletable: string[], missing: string[]}}
 */
function verifyFolded(text, consumed) {
  const archiveLines = splitLines(text);
  const deletable = [];
  const missing = [];

  for (const entry of consumed) {
    const entryLines = splitLines(entry.text);
    // An entry with no real text (every line empty, including the `['']`
    // splitLines('') produces) is never something a genuine check can find
    // present: an empty needle would match any archive containing a blank
    // line, which is not a check at all. Treat it as missing rather than
    // let containsConsecutiveLines wave it through.
    if (entryLines.every((line) => line === '')) {
      missing.push(entry.name);
      continue;
    }
    if (containsConsecutiveLines(archiveLines, entryLines)) {
      deletable.push(entry.name);
    } else {
      missing.push(entry.name);
    }
  }

  return { deletable, missing };
}

module.exports = { foldFragments, verifyFolded };
