// scripts/check-emdash-core.js
// Pure diff/log parsing for the em-dash CI gate; no process, filesystem, or git access here.
// (Ported from the wedding-scavenger-hunt repo's issue #1171.)
'use strict';

const EM_DASH = String.fromCharCode(0x2014);
const AMP = String.fromCharCode(0x26); // '&'
const HASH = String.fromCharCode(0x23); // '#'
const SEMI = String.fromCharCode(0x3b); // ';'

const NAMED_ENTITY_SRC = `${AMP}mdash${SEMI}?`;
// Entities matched loosely -- browsers render zero-padded, case-variant, and semicolon-less entity spellings identically.
const DECIMAL_ENTITY_SRC = `${AMP}${HASH}0*8212${SEMI}?`;
const HEX_ENTITY_SRC = `${AMP}${HASH}[xX]0*2014${SEMI}?`;

const EMDASH_PATTERN = new RegExp(
  `(${EM_DASH}|${NAMED_ENTITY_SRC}|${DECIMAL_ENTITY_SRC}|${HEX_ENTITY_SRC})`
);

// This repo declares no excluded paths for the em-dash gate: every added
// line in every file is checked. The wedding-scavenger-hunt repo this gate
// is ported from carved out its own archival governance/ directory; that
// carve-out does not apply here and is not replaced by anything else.
const EXCLUDED_PATHS = [];

function isExcludedPath(file) {
  return EXCLUDED_PATHS.some((prefix) => file.startsWith(prefix));
}

/** Whitespace-normalized comparison key for carry detection. */
function normalize(line) {
  return line.trim().replace(/\s+/g, ' ');
}

/** 'a/path' / 'b/path' -> 'path'; a path with no a/ or b/ prefix passes through. */
function stripDiffPrefix(rawPath) {
  return rawPath.replace(/^[ab]\//, '');
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const DIFF_FILE_START = /^diff --git /;

/**
 * Walks diff lines once, tagging each hunk-body line as added/removed/context
 * against its new-file path and line number. Header lines ('+++ '/'--- ') are
 * recognized only between a 'diff --git' line and its first '@@' hunk, never
 * inside a hunk body -- an added/removed line whose CONTENT starts with
 * '+++ '/'--- ' stays a hunk-body line instead of being mistaken for a header.
 * @param {string[]} lines
 * @returns {{type: 'added'|'removed'|'context', file: string|null, line: number|null, content: string}[]}
 */
function classifyHunkLines(lines) {
  const entries = [];
  let currentFile = null;
  let lineNo = null;
  let inHunk = false;

  for (const line of lines) {
    if (DIFF_FILE_START.test(line)) {
      inHunk = false;
      continue;
    }
    if (!inHunk && line.startsWith('+++ ')) {
      const raw = line.slice(4).trim();
      currentFile = raw === '/dev/null' ? null : stripDiffPrefix(raw);
      lineNo = null;
      continue;
    }
    if (!inHunk && line.startsWith('--- ')) continue;

    const hunkMatch = HUNK_HEADER.exec(line);
    if (hunkMatch) {
      lineNo = parseInt(hunkMatch[1], 10);
      inHunk = true;
      continue;
    }

    if (!inHunk || lineNo === null) continue;

    // git emits a literal "\ No newline at end of file" marker line right
    // after the removed or added line it describes. It is not a line of the
    // diffed file on either side, so it must not consume a new-file line
    // number the way a real context line does.
    if (line.startsWith('\\')) continue;

    if (line.startsWith('+')) {
      entries.push({ type: 'added', file: currentFile, line: lineNo, content: line.slice(1) });
      lineNo += 1;
    } else if (line.startsWith('-')) {
      entries.push({ type: 'removed', file: currentFile, line: null, content: line.slice(1) });
    } else {
      entries.push({ type: 'context', file: currentFile, line: lineNo, content: line.slice(1) });
      lineNo += 1;
    }
  }

  return entries;
}

/**
 * Reports each added line with an em dash or entity form, excluding
 * relocations and files under EXCLUDED_PATHS.
 * @param {string} diffText unified diff text (as produced by `git diff`)
 * @returns {{file: string, line: number, match: string}[]}
 */
function findEmdashViolations(diffText) {
  const text = String(diffText || '');
  if (text.trim() === '') return [];
  const entries = classifyHunkLines(text.split('\n'));

  const removed = new Set();
  for (const entry of entries) {
    if (entry.type === 'removed') removed.add(normalize(entry.content));
  }

  const violations = [];
  for (const entry of entries) {
    if (entry.type !== 'added' || entry.file === null) continue;
    const match = EMDASH_PATTERN.exec(entry.content);
    if (match && !isExcludedPath(entry.file) && !removed.has(normalize(entry.content))) {
      violations.push({ file: entry.file, line: entry.line, match: match[0] });
    }
  }

  return violations;
}

const REVERT_MARKER = /This reverts commit [0-9a-fA-F]{40}\b/;

/**
 * True when logText contains git's canonical revert marker (This reverts
 * commit followed by a full 40-hex sha).
 * @param {string} logText
 * @returns {boolean}
 */
function hasRevertMarker(logText) {
  return REVERT_MARKER.test(String(logText || ''));
}

module.exports = { findEmdashViolations, hasRevertMarker };
