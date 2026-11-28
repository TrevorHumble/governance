// scripts/check-file-size-core.js
// Pure rules for the file-size gate: a file a change grows past the repo's line limit fails,
// unless repo-profile.json's fileSize.allowed records the file and it is still under 1.2 times
// the recorded size. No process, filesystem or git calls; check-file-size.js supplies those.
'use strict';

const { VENDOR_ROOT, UPSTREAM_COPY_PATHS, isNotCounted } = require('./check-token-budget-core');

const DEFAULT_LIMIT = 800;
// An allowed file is asked about again once it grows 20 percent past its recorded size.
const REGROWTH = 1.2;
const SKIPPED = [
  'package-lock.json',
  'BUILDLOG.md',
  'buildlog/',
  VENDOR_ROOT,
  ...UPSTREAM_COPY_PATHS,
];

const failLine = (text) => `check-file-size: FAIL, ${text}`;

/**
 * Counts lines the way `wc -l` does, plus a last line with no newline.
 * @param {string} text
 * @returns {number}
 */
function countLines(text) {
  if (text.length === 0) return 0;
  const newlines = (text.match(/\n/g) || []).length;
  return text.endsWith('\n') ? newlines : newlines + 1;
}

/**
 * Checks the shape of repo-profile.json's fileSize field. Absent is fine: the default limit
 * applies and nothing is allowed.
 * @param {unknown} fileSize
 * @returns {string|null} the problem, or null
 */
function shapeError(fileSize) {
  if (fileSize === undefined) return null;
  if (!fileSize || typeof fileSize !== 'object' || Array.isArray(fileSize)) {
    return 'fileSize in repo-profile.json must be an object';
  }
  const { limit, allowed } = fileSize;
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
    return 'fileSize.limit in repo-profile.json must be a positive whole number';
  }
  if (allowed === undefined) return null;
  if (!Array.isArray(allowed)) return 'fileSize.allowed in repo-profile.json must be an array';
  for (const entry of allowed) {
    const ok =
      entry &&
      typeof entry.path === 'string' &&
      Number.isInteger(entry.lines) &&
      entry.lines > 0 &&
      typeof entry.why === 'string' &&
      entry.why.trim() !== '';
    if (!ok) {
      return `each fileSize.allowed entry needs a path, a whole-number lines and a why (${JSON.stringify(entry)})`;
    }
  }
  return null;
}

/**
 * @param {object} input
 * @param {{path: string, added: number, deleted: number}[]} input.changes one per changed file;
 *   a binary file comes with NaN counts and is skipped
 * @param {(file: string) => number|null} input.lineCount the file's lines now, null if deleted
 * @param {unknown} [input.fileSize] repo-profile.json's fileSize field
 * @returns {{lines: string[], exitCode: number}}
 */
function run({ changes, lineCount, fileSize }) {
  const bad = shapeError(fileSize);
  if (bad) return { lines: [failLine(`${bad}.`)], exitCode: 1 };
  const limit = (fileSize && fileSize.limit) || DEFAULT_LIMIT;
  const allowed = (fileSize && fileSize.allowed) || [];

  const failures = [];
  const allowedPast = [];
  let checked = 0;
  for (const { path, added, deleted } of changes) {
    if (!(added > deleted) || isNotCounted(path, SKIPPED)) continue;
    const lines = lineCount(path);
    if (lines === null) continue;
    checked += 1;
    if (lines <= limit) continue;
    const entry = allowed.find((e) => e.path === path);
    if (entry && lines < entry.lines * REGROWTH) {
      allowedPast.push(
        `${path} (${lines} lines, recorded ${entry.lines}, allowed under ${Math.ceil(entry.lines * REGROWTH)})`
      );
      continue;
    }
    const why = entry
      ? `grew to ${lines} lines, past 1.2 times the ${entry.lines} recorded in fileSize.allowed`
      : `grew to ${lines} lines, over the ${limit}-line limit`;
    failures.push(
      failLine(
        `${path} ${why}. Split the file, or record why it is one job: a fileSize.allowed entry in repo-profile.json with "path", "lines": ${lines} and "why".`
      )
    );
  }
  if (failures.length > 0) return { lines: failures, exitCode: 1 };
  const lines = [`check-file-size: OK, ${checked} grown file(s) checked (limit ${limit}).`];
  if (allowedPast.length > 0)
    lines.push(`  grown past the limit, allowed: ${allowedPast.join('; ')}`);
  return { lines, exitCode: 0 };
}

module.exports = { run, countLines, shapeError, failLine, DEFAULT_LIMIT, REGROWTH };
