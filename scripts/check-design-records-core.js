// scripts/check-design-records-core.js
// Pure rules for the design-record check: the header a design file opens with, and the shape and
// length of each record under it. No process or filesystem access here.
'use strict';

// Everything before the first `## ` line must equal this, after the line endings, trailing
// spaces, and outer blank lines are normalized. The file the writing model reads first carries the
// rule, so it is in view before any record is written.
const HEADER = [
  '# DESIGN',
  '',
  'Design records for this repo, newest first. Each record is a `## ` title, then a line with the date and issue (`2026-10-22, #100`), then `Decided:`, `Why:` and `Gave up:` lines. At most 150 words per record; aim for under 100. CI checks this: `npm run check:design`.',
].join('\n');

// The header's paragraph after the title: repeated in every failure message.
const RULE = HEADER.split('\n\n')[1];

const MAX_WORDS = 150;
const NOTE_WORDS = 100;

const DATE_LINE = /^\d{4}-\d{2}-\d{2}, #\d+/;
const LABELS = ['Decided:', 'Why:', 'Gave up:'];

const PREFIX = 'check-design-records: FAIL, ';
const failLine = (text) => `${PREFIX}${text} Rule: ${RULE}`;
const noteLine = (text) => `check-design-records: note, ${text}`;

/**
 * The header text in its compared form: `\n` line endings, no trailing whitespace on a line, no
 * blank lines at either end.
 * @param {string[]} lines the lines before the first record
 * @returns {string}
 */
function normalizedHeader(lines) {
  return lines
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

/**
 * Splits a design file into its header and its records. A record runs from its `## ` line to the
 * line before the next `## ` line, or the end.
 * @param {string} text the file's text
 * @returns {{header: string, records: {title: string, line: number, lines: string[]}[]}}
 *   `line` is the 1-based line number of the record's `## ` line
 */
function parse(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const starts = [];
  lines.forEach((l, i) => {
    if (l.startsWith('## ')) starts.push(i);
  });
  const headerEnd = starts.length > 0 ? starts[0] : lines.length;
  const records = starts.map((start, n) => {
    const end = n + 1 < starts.length ? starts[n + 1] : lines.length;
    return {
      title: lines[start].slice(3).trim(),
      line: start + 1,
      lines: lines.slice(start, end),
    };
  });
  return { header: normalizedHeader(lines.slice(0, headerEnd)), records };
}

/** Every whitespace-separated token of a record, the `##` and the labels included. */
const wordCount = (record) => record.lines.join('\n').split(/\s+/).filter(Boolean).length;

/**
 * The verdict on one design file.
 * @param {object} args
 * @param {string} args.text the file's text
 * @param {string} args.path the path to name in messages
 * @returns {{lines: string[], exitCode: number}}
 */
function run({ text, path }) {
  const { header, records } = parse(text);
  const out = [];
  let failed = false;
  if (header !== HEADER) {
    failed = true;
    // The expected header holds the rule, so it is not repeated after it.
    out.push(
      `${PREFIX}${path} must open with this header, and it is missing or changed:\n\n${HEADER}\n`
    );
  }
  for (const r of records) {
    const name = `${path}:${r.line} (${r.title})`;
    const body = r.lines.slice(1);
    const problems = [];
    const words = wordCount(r);
    if (words > MAX_WORDS) problems.push(`has ${words} words, over the ${MAX_WORDS} limit`);
    if (!body.some((l) => DATE_LINE.test(l))) {
      problems.push('has no date and issue line (`2026-10-22, #100`)');
    }
    for (const label of LABELS) {
      if (!body.some((l) => l.startsWith(label))) problems.push(`has no \`${label}\` line`);
    }
    if (problems.length > 0) {
      failed = true;
      out.push(failLine(`${name} ${problems.join('; ')}.`));
    } else if (words > NOTE_WORDS) {
      out.push(noteLine(`${name} has ${words} words; aim for under ${NOTE_WORDS}.`));
    }
  }
  if (!failed) {
    out.push(`check-design-records: ok, ${records.length} record(s) in ${path}`);
  }
  return { lines: out, exitCode: failed ? 1 : 0 };
}

module.exports = { HEADER, RULE, MAX_WORDS, NOTE_WORDS, parse, wordCount, run, failLine };
