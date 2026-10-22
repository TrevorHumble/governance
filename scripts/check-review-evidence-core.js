// scripts/check-review-evidence-core.js
// Pure rules for the review-evidence gate: which working-tree id a review echoes, which file:line
// citations it makes, and whether each citation points at a line that exists. No process,
// filesystem, or git access here.
'use strict';

const failLine = (text) => `check-review-evidence: FAIL, ${text}`;

// A tree id is a git object ID: 40 hex digits (sha1) or 64 (sha256).
const TREE_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const ECHO = /Reviewed tree:[ \t]*([0-9A-Za-z]+)/;

// path:line or path:from-to. The path may be relative, bare, absolute, or Windows-style (a drive
// letter, `\` as separator); it may not start in the middle of a longer path or URL, and the digits
// may not run into letters. A range separator with no number after it is kept, to be reported.
// The range separators: hyphen, en dash, em dash. The em dash is built from its code point so this
// file's source never holds one (the em-dash gate would flag it).
const RANGE_DASHES = `-${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}`;
const CITATION = new RegExp(
  String.raw`(?<![\w@/\\.+-])((?:[A-Za-z]:)?[\\/]?[\w@+.-]+(?:[\\/][\w@+.-]+)*):(\d+)(?:([${RANGE_DASHES}])(\d+)?)?(?![\w])`,
  'g'
);
// Text with a separator or a file extension reads as a file. "12:30", "localhost:3000", and
// "Step 9:5" do not, so they are not citations.
const LOOKS_LIKE_FILE = /[\\/]|\.[A-Za-z][A-Za-z0-9]*$/;

/**
 * The tree id the review echoes on its first non-empty line, as `Reviewed tree: <id>`.
 * @param {string} text the saved reviewer reply
 * @returns {{id: string} | {error: string}}
 */
function echoedTree(text) {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '');
  if (first === undefined) return { error: 'the review file is empty' };
  const m = ECHO.exec(first);
  if (!m) {
    return { error: 'the first line of the review does not carry "Reviewed tree: <id>"' };
  }
  const id = m[1].toLowerCase();
  if (!TREE_ID.test(id)) return { error: `the echoed tree id "${m[1]}" is not a git tree id` };
  return { id };
}

/**
 * Every file:line and file:from-to citation in a review. A range may be separated by a hyphen, an
 * en dash, or an em dash; a separator with no end number gives `unreadable: true`.
 * @param {string} text the saved reviewer reply
 * @returns {{path: string, from: number, to: number, text: string, unreadable: boolean}[]} paths
 *   with `/` as the separator and no leading `./`
 */
function findCitations(text) {
  const found = [];
  for (const m of text.matchAll(CITATION)) {
    if (!LOOKS_LIKE_FILE.test(m[1])) continue;
    const from = Number(m[2]);
    const unreadable = m[3] !== undefined && m[4] === undefined;
    const to = m[4] === undefined ? from : Number(m[4]);
    const path = m[1].replace(/\\/g, '/').replace(/^\.\//, '');
    found.push({ path, from, to, text: m[0], unreadable });
  }
  return found;
}

/**
 * The citations that do not hold, one plain-language problem each.
 * @param {ReturnType<typeof findCitations>} citations
 * @param {(path: string) => {lines: number} | {problem: string}} resolve the file a citation names:
 *   its line count, or why it names no single file of the working tree
 * @returns {string[]}
 */
function citationProblems(citations, resolve) {
  const problems = [];
  const seen = new Set();
  for (const c of citations) {
    if (seen.has(c.text)) continue;
    seen.add(c.text);
    if (c.unreadable) {
      problems.push(`${c.text}: the range has no end line`);
      continue;
    }
    const file = resolve(c.path);
    if (file.problem !== undefined) {
      problems.push(`${c.text}: ${file.problem}`);
    } else if (c.from < 1 || c.to < c.from) {
      problems.push(`${c.text}: not a line range`);
    } else if (c.to > file.lines) {
      problems.push(`${c.text}: ${c.path} has ${file.lines} line(s)`);
    }
  }
  return problems;
}

/**
 * The gate's verdict on one saved review.
 * @param {object} args
 * @param {string} args.review the saved reviewer reply
 * @param {string} args.currentTree the working-tree id now
 * @param {(path: string) => {lines: number} | {problem: string}} args.resolve see citationProblems
 * @returns {{lines: string[], exitCode: number}}
 */
function run({ review, currentTree, resolve }) {
  const echo = echoedTree(review);
  const problems = [];
  if (echo.error) {
    problems.push(echo.error);
  } else if (echo.id !== currentTree.toLowerCase()) {
    problems.push(
      `the review is of tree ${echo.id}, but the working tree is now ${currentTree}; the code changed after the review, so it needs a new one`
    );
  }
  const citations = findCitations(review);
  problems.push(...citationProblems(citations, resolve));
  if (problems.length > 0) {
    return { lines: problems.map(failLine), exitCode: 1 };
  }
  return {
    lines: [
      `check-review-evidence: ok, reviewed tree ${currentTree} is the working tree and ${citations.length} citation(s) exist`,
    ],
    exitCode: 0,
  };
}

module.exports = { echoedTree, findCitations, citationProblems, run, failLine };
