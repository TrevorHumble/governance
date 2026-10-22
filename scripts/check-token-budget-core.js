// scripts/check-token-budget-core.js
// Pure token counting and budget-guard rules for the token-budget CI gate; no process, filesystem,
// or git access here.
'use strict';

const { isDeepStrictEqual } = require('util');

const LARGEST_FILES_SHOWN = 5;
// Tokens per word is 1.35, kept as a whole number so the arithmetic stays exact.
const TOKENS_PER_100_WORDS = 135;
const VENDOR_ROOT = 'vendor/skills/';

const REVIEWER_FOLDER = /(?:^|\/)\.claude\/skills\/((?:reviewing-[^/]+)|refereeing)\/.+/;
const REVIEWER_SHARED_PATHS = ['standards/reviewing.md', '.claude/agents/reviewer.md', 'AGENTS.md'];

const TOTAL_WAYS = [
  "Ways to make room (cutting, moving, or removing a rule, touching other files, or raising a cap needs the owner's yes first):",
  '  - say something more concisely anywhere in the repo',
  '  - move a rule into a check that passes or fails',
  '  - remove something that no longer earns its place',
  '  - ask the owner to raise budget.total in repo-profile.json',
];
const REVIEWER_WAYS = [
  "Ways to make room (cutting or moving a reviewer's reading needs the owner's yes first): cut that reviewer's own reading (its skill, its reads, its vendored files), or move a large skill to a one-pass specialist.",
];

// A file a guarded PR may change beside its guarded file: the build log and its fragments.
const ridesAlong = (file) => file === 'BUILDLOG.md' || file.startsWith('buildlog/');
const isVendored = (file) => file.startsWith(VENDOR_ROOT);
const isCap = (n) => typeof n === 'number' && Number.isFinite(n);
const failLine = (text) => `check-token-budget: FAIL, ${text}`;

function toTokens(words) {
  return Math.ceil((words * TOKENS_PER_100_WORDS) / 100);
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Reads the `metadata.reads` list from a reviewer SKILL.md. Not a YAML parser: it understands the
 * one shape the Agent Skills format allows, `metadata:` then an indented `reads: "<paths>"` string.
 * @param {string} raw the whole SKILL.md
 * @returns {{reads: string[], body: string, error?: string}} `reads` is empty when the file has no
 *   frontmatter or no `metadata.reads`
 */
function parseSkill(raw) {
  const text = raw.replace(/^\uFEFF/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { reads: [], body: text };
  const body = text.slice(m[0].length);
  const lines = m[1].split(/\r?\n/);
  const start = lines.findIndex((l) => /^metadata:\s*$/.test(l));
  if (start === -1) return { reads: [], body };
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const r = /^\s+reads:\s*(.*?)\s*$/.exec(line);
    if (!r) continue;
    const quoted = /^(["'])(.*)\1$/.exec(r[1]);
    const value = quoted ? quoted[2] : r[1];
    if (!quoted && (value === '' || /^[>|]/.test(value))) {
      return { reads: [], body, error: 'metadata.reads must be one quoted string of paths' };
    }
    return { reads: value.split(/\s+/).filter(Boolean), body };
  }
  return { reads: [], body };
}

function isNotCounted(file, notCounted) {
  return notCounted.some((e) => (e.endsWith('/') ? file.startsWith(e) : file === e));
}

/**
 * What a tree counts: the files and pending budgets in its `new-tree.json` while it has one,
 * otherwise every tracked `.md`. Vendored paths never count toward the total, in either mode, and
 * existence on disk alone never counts.
 * @param {{tree: object | null, listing: string[], notCounted: string[]}} view
 * @returns {{files: string[], pending: Record<string, number>}}
 */
function countInputs({ tree, listing, notCounted }) {
  if (!tree) {
    const files = listing.filter(
      (f) => f.endsWith('.md') && !isVendored(f) && !isNotCounted(f, notCounted)
    );
    return { files, pending: {} };
  }
  const files = (tree.files || [])
    .map((f) => f.path)
    .filter((f) => !isVendored(f) && !isNotCounted(f, notCounted));
  const pending = {};
  for (const p of tree.pending || []) pending[p.path] = p.budget;
  return { files, pending };
}

function countedPaths(view) {
  const { files, pending } = countInputs(view);
  return new Set([...files, ...Object.keys(pending)]);
}

/**
 * The guarded budget changes between a base and the head: a cap raised, a notCounted entry added,
 * a path counted at the base that still exists at the head but is not counted there, a pending
 * budget lowered while its path is still pending. Each is a line; no lines means none.
 * @param {{caps: {total: number, reviewer: number}, view: object}} base
 * @param {{caps: {total: number, reviewer: number}, view: object}} head
 * @returns {string[]}
 */
function guardedChanges(base, head) {
  const changes = [];
  for (const cap of ['total', 'reviewer']) {
    if (head.caps[cap] > base.caps[cap]) {
      changes.push(`budget.${cap} raised from ${base.caps[cap]} to ${head.caps[cap]}`);
    }
  }
  for (const entry of head.view.notCounted) {
    if (!base.view.notCounted.includes(entry)) changes.push(`budget.notCounted gained ${entry}`);
  }
  const headCounted = countedPaths(head.view);
  const headExists = new Set(head.view.listing);
  for (const file of [...countedPaths(base.view)].sort()) {
    if (headExists.has(file) && !headCounted.has(file)) {
      changes.push(`${file} was counted at the base and still exists, but is no longer counted`);
    }
  }
  const basePending = countInputs(base.view).pending;
  const headInputs = countInputs(head.view);
  for (const [file, budget] of Object.entries(headInputs.pending)) {
    if (file in basePending && !headInputs.files.includes(file) && budget < basePending[file]) {
      changes.push(`pending budget for ${file} lowered from ${basePending[file]} to ${budget}`);
    }
  }
  return changes;
}

/**
 * Fails when a guarded change is not the PR's only change. The two budget homes
 * (repo-profile.json, new-tree.json) may change with it; `buildlog/` and BUILDLOG.md may too.
 * @param {string[]} changes output of guardedChanges
 * @param {string[]} changed repo-relative paths the PR changes
 * @param {object} baseProfile
 * @param {object} headProfile
 * @returns {string[]} failure lines
 */
function guardFailures(changes, changed, baseProfile, headProfile) {
  if (changes.length === 0) return [];
  const homes = ['repo-profile.json', 'new-tree.json'];
  const others = changed.filter((f) => !homes.includes(f) && !ridesAlong(f));
  const strip = ({ budget: _budget, ...rest }) => rest;
  const profileRides =
    changed.includes('repo-profile.json') &&
    !isDeepStrictEqual(strip(baseProfile), strip(headProfile));
  if (others.length === 0 && !profileRides) return [];
  const lines = [
    failLine(
      `a budget change must be the only change in its PR (apart from buildlog/ and BUILDLOG.md). Guarded change: ${changes.join('; ')}.`
    ),
  ];
  if (others.length > 0) lines.push(`  Other changed files: ${others.join(', ')}`);
  if (profileRides) lines.push('  repo-profile.json also changes outside its budget key.');
  lines.push("  Move the budget change to its own PR, with the owner's yes first.");
  return lines;
}

function libraryShapeProblems(library) {
  const problems = [];
  for (const [i, e] of library.entries()) {
    const label = e && typeof e.name === 'string' ? e.name : `entry ${i}`;
    const files = e && Array.isArray(e.files) ? e.files : null;
    if (
      !files ||
      !Array.isArray(e.reviewers) ||
      !e.reviewers.every((r) => typeof r === 'string') ||
      !files.every((f) => f && typeof f.path === 'string' && typeof f.sha256 === 'string')
    ) {
      problems.push(
        `reviewer-library.json ${label} needs reviewers and files with path and sha256.`
      );
    } else if (!files.every((f) => isVendored(f.path))) {
      problems.push(`reviewer-library.json ${label} lists a file outside ${VENDOR_ROOT}.`);
    }
  }
  return problems;
}

/**
 * The library's checks against the reviewers found and the vendored files on disk.
 * @param {object[]} library reviewer-library.json entries
 * @param {{name: string, reads: string[]}[]} reviewers
 * @param {Record<string, string>} vendorHashes sha256 of every file under VENDOR_ROOT on disk
 * @returns {string[]} failure lines
 */
function libraryFailures(library, reviewers, vendorHashes) {
  const shape = libraryShapeProblems(library);
  if (shape.length > 0) return shape.map(failLine);
  const problems = [];
  const entryFiles = new Set(library.flatMap((e) => e.files.map((f) => f.path)));
  for (const entry of library) {
    for (const name of entry.reviewers) {
      const reviewer = reviewers.find((r) => r.name === name);
      if (!reviewer) {
        problems.push(
          failLine(
            `reviewer-library.json ${entry.name} names reviewer ${name}, which matches no reviewer folder.`
          )
        );
        continue;
      }
      for (const f of entry.files.filter((f) => f.path.endsWith('.md'))) {
        if (!reviewer.reads.includes(f.path)) {
          problems.push(
            failLine(
              `reviewer ${name} does not list ${f.path} in metadata.reads, but reviewer-library.json ${entry.name} gives it to that reviewer.`
            )
          );
        }
      }
    }
  }
  for (const r of reviewers) {
    for (const p of r.reads.filter(isVendored)) {
      const named = library.some(
        (e) => e.reviewers.includes(r.name) && e.files.some((f) => f.path === p)
      );
      if (!named) {
        problems.push(
          failLine(
            `reviewer ${r.name} reads ${p}, which has no reviewer-library.json entry naming that reviewer.`
          )
        );
      }
    }
  }
  for (const entry of library) {
    for (const f of entry.files) {
      if (!(f.path in vendorHashes)) {
        problems.push(failLine(`${f.path} is in reviewer-library.json but not on disk.`));
      } else if (vendorHashes[f.path] !== f.sha256) {
        problems.push(
          failLine(
            `${f.path} has sha256 ${vendorHashes[f.path]}, but reviewer-library.json records ${f.sha256}.`
          )
        );
      }
    }
  }
  for (const p of Object.keys(vendorHashes).sort()) {
    if (!entryFiles.has(p)) {
      problems.push(
        failLine(`${p} is under ${VENDOR_ROOT} but has no reviewer-library.json entry.`)
      );
    }
  }
  return problems;
}

/**
 * @param {string[]} files repo-relative paths from countInputs; only `.md` files are counted, others
 *   count as zero. A vendored path is read through a reviewer's reads, never listed here.
 * @param {(file: string) => string} readFile
 * @param {{total: number, reviewer: number}} caps token limits, from repo-profile.json
 * @param {object} [extra]
 * @param {Record<string, number>} [extra.pending] path -> budget in tokens for a file not written
 *   yet; added to the total, and to a reviewer when the path is in REVIEWER_SHARED_PATHS or the
 *   reviewer's reads, and only for a path absent from `files`
 * @param {object[]} [extra.library] reviewer-library.json entries; omitted, the library checks are off
 * @param {Record<string, string>} [extra.vendorHashes] sha256 of every file under VENDOR_ROOT on disk
 * @param {Set<string>} [extra.tracked] tracked paths, for the backticked-path check on reviewer skills
 * @param {{ref: string, total?: number, reviewers?: Record<string, number>}} [extra.base] the base's
 *   own counts, for the "was already over" note
 * @returns {{lines: string[], exitCode: number, total?: number, reviewers?: Record<string, number>}}
 */
function run(files, readFile, caps, extra = {}) {
  const { pending = {}, library, vendorHashes = {}, tracked, base } = extra;
  if (!caps || !isCap(caps.total) || !isCap(caps.reviewer)) {
    return {
      lines: [
        failLine('budget.total and budget.reviewer must both be numbers in repo-profile.json.'),
      ],
      exitCode: 1,
    };
  }
  if (files.length === 0) {
    return { lines: [failLine('the file list is empty.')], exitCode: 1 };
  }

  const words = new Map();
  const wordsOf = (file) => {
    if (!words.has(file)) {
      words.set(file, file.endsWith('.md') || isVendored(file) ? countWords(readFile(file)) : 0);
    }
    return words.get(file);
  };
  const cannotRead = (file, err) => ({
    lines: [failLine(`cannot read ${file} (${err.message}).`)],
    exitCode: 1,
  });
  for (const file of files) {
    try {
      wordsOf(file);
    } catch (err) {
      return cannotRead(file, err);
    }
  }

  const listed = [...words.keys()];
  const pendingEntries = Object.entries(pending).filter(([p]) => !words.has(p));
  const pendingTotal = pendingEntries.reduce((sum, [, tokens]) => sum + tokens, 0);
  const total = toTokens(listed.reduce((sum, f) => sum + words.get(f), 0)) + pendingTotal;

  const folders = new Map();
  for (const file of listed) {
    const m = REVIEWER_FOLDER.exec(file);
    if (m) folders.set(m[1], [...(folders.get(m[1]) || []), file]);
  }
  if (folders.size === 0) {
    return {
      lines: [failLine('no reviewing-* or refereeing skill folder found.')],
      exitCode: 1,
    };
  }

  const problems = [];
  const reviewers = [];
  for (const [name, folderFiles] of [...folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const skillPath = folderFiles.find((f) => f.endsWith('/SKILL.md'));
    const skill = skillPath ? parseSkill(readFile(skillPath)) : { reads: [], body: '' };
    if (skill.error) problems.push(failLine(`${skillPath}: ${skill.error}.`));
    const { reads } = skill;

    const paths = new Set([...folderFiles, ...REVIEWER_SHARED_PATHS, ...reads]);
    let counted = 0;
    let vendored = 0;
    let pendingTokens = 0;
    for (const p of paths) {
      // A shared path not listed, not pending, and not in reads counts as zero, because
      // .claude/agents/reviewer.md exists only after the swap.
      if (words.has(p)) {
        counted += words.get(p);
        if (isVendored(p)) vendored += words.get(p);
      } else if (p in pending) {
        pendingTokens += pending[p];
      } else if (!REVIEWER_SHARED_PATHS.includes(p) || reads.includes(p)) {
        try {
          // A listed read must exist even when it is not .md and so counts as zero.
          if (reads.includes(p) && !p.endsWith('.md')) readFile(p);
          counted += wordsOf(p);
          if (isVendored(p)) vendored += words.get(p);
        } catch (err) {
          return cannotRead(p, err);
        }
      }
    }
    reviewers.push({
      name,
      reads,
      tokens: toTokens(counted) + pendingTokens,
      vendoredTokens: toTokens(vendored),
    });

    if (tracked) {
      const named = new Set(
        (skill.body.match(/`[^`\n]+`/g) || [])
          .map((t) => t.slice(1, -1))
          .filter((t) => t !== skillPath)
      );
      for (const token of named) {
        if (tracked.has(token) && !reads.includes(token)) {
          problems.push(
            failLine(`${skillPath} names ${token} in its body but not in metadata.reads.`)
          );
        }
      }
    }
  }

  if (library) problems.push(...libraryFailures(library, reviewers, vendorHashes));

  const baseNote = (baseTokens, what) => {
    if (!base) return [];
    if (baseTokens === undefined) return [`  The base (${base.ref}) has no count for ${what}.`];
    return baseTokens > (what === 'the total' ? caps.total : caps.reviewer)
      ? [`  The base (${base.ref}) was already over: ${baseTokens} tokens.`]
      : [`  The base (${base.ref}) was ${baseTokens} tokens, under the limit.`];
  };

  const lines = [];
  if (total > caps.total) {
    lines.push(failLine(`${total} tokens in total, over the ${caps.total} limit.`));
    lines.push(...baseNote(base && base.total, 'the total'));
    lines.push(`Largest ${LARGEST_FILES_SHOWN} files:`);
    const largest = [
      ...listed.filter((f) => f.endsWith('.md')).map((f) => [f, toTokens(words.get(f)), '']),
      ...pendingEntries.map(([f, tokens]) => [f, tokens, ' (pending)']),
    ]
      .sort(([fa, a], [fb, b]) => b - a || fa.localeCompare(fb))
      .slice(0, LARGEST_FILES_SHOWN);
    for (const [f, tokens, mark] of largest) lines.push(`  ${f}: ${tokens} tokens${mark}`);
    lines.push(...TOTAL_WAYS);
  } else {
    lines.push(`check-token-budget: ${total} tokens in total (limit ${caps.total}).`);
  }
  for (const r of reviewers) {
    const vendoredNote = r.vendoredTokens > 0 ? `; ${r.vendoredTokens} of it vendored` : '';
    lines.push(`  reviewer ${r.name}: ${r.tokens} tokens (limit ${caps.reviewer}${vendoredNote})`);
  }
  const heavy = reviewers.filter((r) => r.tokens > caps.reviewer);
  for (const r of heavy) {
    lines.push(failLine(`reviewer ${r.name} is ${r.tokens} tokens, over ${caps.reviewer}.`));
    lines.push(...baseNote(base && base.reviewers && base.reviewers[r.name], `reviewer ${r.name}`));
    lines.push(...REVIEWER_WAYS);
  }
  lines.push(...problems);

  return {
    lines,
    exitCode: total > caps.total || heavy.length > 0 || problems.length > 0 ? 1 : 0,
    total,
    reviewers: Object.fromEntries(reviewers.map((r) => [r.name, r.tokens])),
  };
}

module.exports = {
  run,
  parseSkill,
  countInputs,
  guardedChanges,
  guardFailures,
  isNotCounted,
  isCap,
  failLine,
  ridesAlong,
  VENDOR_ROOT,
};
