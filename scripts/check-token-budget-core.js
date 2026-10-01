// scripts/check-token-budget-core.js
// Pure token counting for the token-budget CI gate; no process, filesystem, or git access here.
'use strict';

const TOTAL_LIMIT = 25000;
const REVIEWER_LIMIT = 10000;
const LARGEST_FILES_SHOWN = 5;
// Tokens per word is 1.35, kept as a whole number so the arithmetic stays exact.
const TOKENS_PER_100_WORDS = 135;

const REVIEWER_FOLDER =
  /(?:^|\/)(?:_claude|\.claude)\/skills\/((?:reviewing-[^/]+)|refereeing)\/.+/;
const REVIEWER_SHARED_PATHS = [
  'standards/reviewing.md',
  '_claude/agents/reviewer.md',
  '.claude/agents/reviewer.md',
  'AGENTS.md',
];

function toTokens(words) {
  return Math.ceil((words * TOKENS_PER_100_WORDS) / 100);
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * @param {string[]} files repo-relative paths; only `.md` files are counted, others count as zero
 * @param {(file: string) => string} readFile
 * @param {Record<string, number>} [pending] path -> budget in tokens for a file not written yet;
 *   added to each reviewer's total only, and only for a path in REVIEWER_SHARED_PATHS that is absent from `files`
 * @returns {{lines: string[], exitCode: number}}
 */
function run(files, readFile, pending = {}) {
  if (files.length === 0) {
    return { lines: ['check-token-budget: FAIL, the file list is empty.'], exitCode: 1 };
  }

  const words = new Map();
  for (const file of files) {
    if (words.has(file)) continue;
    if (!file.endsWith('.md')) {
      words.set(file, 0);
      continue;
    }
    try {
      words.set(file, countWords(readFile(file)));
    } catch (err) {
      return {
        lines: [`check-token-budget: FAIL, cannot read ${file} (${err.message}).`],
        exitCode: 1,
      };
    }
  }

  const totalWords = [...words.values()].reduce((a, b) => a + b, 0);
  const total = toTokens(totalWords);

  const folders = new Map();
  for (const file of words.keys()) {
    const m = REVIEWER_FOLDER.exec(file);
    if (m) folders.set(m[1], [...(folders.get(m[1]) || []), file]);
  }
  if (folders.size === 0) {
    return {
      lines: ['check-token-budget: FAIL, no reviewing-* or refereeing skill folder found.'],
      exitCode: 1,
    };
  }

  const sharedWords = REVIEWER_SHARED_PATHS.reduce((sum, p) => sum + (words.get(p) || 0), 0);
  const pendingTokens = Object.entries(pending)
    .filter(([p]) => REVIEWER_SHARED_PATHS.includes(p) && !words.has(p))
    .reduce((sum, [, tokens]) => sum + tokens, 0);
  const reviewers = [...folders.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, folderFiles]) => {
      const folderWords = folderFiles.reduce((sum, f) => sum + words.get(f), 0);
      return { name, tokens: toTokens(folderWords + sharedWords) + pendingTokens };
    });
  const heavy = reviewers.filter((r) => r.tokens > REVIEWER_LIMIT);

  const lines = [];
  if (total > TOTAL_LIMIT) {
    lines.push(
      `check-token-budget: FAIL, ${total} tokens in total, over the ${TOTAL_LIMIT} limit.`
    );
    lines.push(`Largest ${LARGEST_FILES_SHOWN} files:`);
    const largest = [...words.entries()]
      .filter(([f]) => f.endsWith('.md'))
      .sort(([fa, a], [fb, b]) => b - a || fa.localeCompare(fb))
      .slice(0, LARGEST_FILES_SHOWN);
    for (const [f, w] of largest) lines.push(`  ${f}: ${toTokens(w)} tokens`);
  } else {
    lines.push(`check-token-budget: ${total} tokens in total (limit ${TOTAL_LIMIT}).`);
  }
  for (const r of reviewers) {
    lines.push(`  reviewer ${r.name}: ${r.tokens} tokens (limit ${REVIEWER_LIMIT})`);
  }
  for (const r of heavy) {
    lines.push(
      `check-token-budget: FAIL, reviewer ${r.name} is ${r.tokens} tokens, over ${REVIEWER_LIMIT}.`
    );
  }

  return { lines, exitCode: total > TOTAL_LIMIT || heavy.length > 0 ? 1 : 0 };
}

module.exports = { run, TOTAL_LIMIT };
