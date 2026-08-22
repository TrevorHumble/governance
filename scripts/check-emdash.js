// scripts/check-emdash.js
// CI gate: rejects a PR whose added lines carry an em dash or entity form.
// (Ported from the wedding-scavenger-hunt repo's issue #1171.)
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { findEmdashViolations, hasRevertMarker } = require('./check-emdash-core');

// ESCAPE_HINT is assembled from a code point, not typed as a template-string
// escape, so this file's source text never contains the sequence it prints.
const BACKSLASH = String.fromCharCode(0x5c);
const ESCAPE_HINT = `${BACKSLASH}u2014`;

// Named so the ENOBUFS message below and the maxBuffer option can never
// disagree about what the cap actually is.
const MAX_BUFFER_BYTES = 256 * 1024 * 1024;

// Named for the same reason: the error message below and the cap can never
// disagree about what the limit actually is. Bounds the per-file `git diff
// --no-index` subprocess spawn in the untracked-file scan below; an
// un-gitignored build-output directory could otherwise spawn thousands of
// git processes in one local run.
const MAX_UNTRACKED_FILES = 2000;

// DEFAULT_BRANCH_FALLBACK: this file's one copy of the 'main' fallback value.
// tools/repo-profile-core.ps1's $FieldDefaults table is the PowerShell-side
// owner of the same fallback for every PowerShell tool; a Node script cannot
// dot-source a `.ps1` file, so this stays the one sanctioned cross-language
// copy.
const DEFAULT_BRANCH_FALLBACK = 'main';

/**
 * Reads `defaultBranch` from this repo's `repo-profile.json`, resolved
 * relative to this script's own location so it works regardless of the
 * caller's working directory. Fails soft to `DEFAULT_BRANCH_FALLBACK` if the
 * profile file is missing, unreadable, or the field is absent -- this check
 * must never crash for a missing or incomplete profile.
 * @returns {string}
 */
function readDefaultBranch() {
  try {
    const profilePath = path.join(__dirname, '..', 'repo-profile.json');
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    return profile.defaultBranch || DEFAULT_BRANCH_FALLBACK;
  } catch {
    return DEFAULT_BRANCH_FALLBACK;
  }
}

/**
 * Runs git, returning the raw spawnSync result. Shared by `runGit` and
 * `runGitDiffTolerant` so the ENOBUFS message and the "failed to start"
 * message have exactly one copy each. Always disables `core.quotePath`, so
 * a path with non-ASCII bytes comes back as its real on-disk name in every
 * caller (`ls-files` output and `diff` file headers alike) instead of git's
 * quoted rendering, which callers that parse those headers or hand paths to
 * another git invocation cannot round-trip. `core.quotePath` does not affect
 * double quotes, backslashes, or control characters in a path -- git always
 * escapes those regardless of this setting (see `core.quotePath` in
 * https://git-scm.com/docs/git-config), so a name containing one of those
 * still prints in escaped form with the diff `b/` prefix still attached
 * (stripDiffPrefix in check-emdash-core.js only matches an unquoted leading
 * `a/`/`b/`); see the known-gaps list in `WHAT-IT-CHECKS.md` and
 * `DESIGN.md`.
 * @param {string[]} args
 * @returns {import('child_process').SpawnSyncReturns<string>}
 */
function spawnGit(args) {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER_BYTES,
  });
  if (result.error) {
    if (result.error.code === 'ENOBUFS') {
      throw new Error(
        `git ${args.join(' ')} produced more output than the ${MAX_BUFFER_BYTES / (1024 * 1024)} MiB buffer cap allows. git did start and run; only its output exceeded the configured limit. Narrow EMDASH_BASE or raise maxBuffer in scripts/check-emdash.js.`
      );
    }
    throw new Error(`git ${args.join(' ')} failed to start: ${result.error.message}`);
  }
  return result;
}

/**
 * Run git and return stdout, or throw with a message naming the failure.
 * Never returns a partial/guessed result on failure.
 * @param {string[]} args
 * @returns {string}
 */
function runGit(args) {
  const result = spawnGit(args);
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} exited ${result.status}: ${String(result.stderr || '').trim()}`
    );
  }
  return result.stdout;
}

/**
 * Run a `git diff` variant, tolerating exit status 1 (`git diff`'s "found
 * differences" status for both a range diff and `--no-index`) as success
 * rather than failure. A status-1 result with empty stdout and nonempty
 * stderr is not tolerated: that combination means the diff itself could not
 * run (a quoted-path file `--no-index` could not open, a file removed
 * between enumeration and this call, a permission-denied read), not "no
 * differences to show," so it throws with the git stderr, naming whichever
 * path was passed in `args`.
 * @param {string[]} args
 * @returns {string}
 */
function runGitDiffTolerant(args) {
  const result = spawnGit(args);
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `git ${args.join(' ')} exited ${result.status}: ${String(result.stderr || '').trim()}`
    );
  }
  if (result.status === 1 && result.stdout === '' && String(result.stderr || '').trim() !== '') {
    throw new Error(
      `git ${args.join(' ')} exited 1 with no diff output: ${String(result.stderr).trim()}`
    );
  }
  return result.stdout;
}

/**
 * Lists untracked, non-gitignored file paths (as git ls-files emits them:
 * relative to the current working directory) in the working tree. Uses
 * `-z`/NUL-splitting rather than newline-splitting or `.trim()` -- `-z` is
 * what makes this call's output verbatim (no quoting at all, of any byte),
 * so a path containing a newline, or leading/trailing spaces git would
 * otherwise quote away, survives intact instead of being split apart or
 * silently mangled. `core.quotePath=false` (set once, in `spawnGit`) is a
 * separate concern: it only affects the diff-header parsing that later
 * consumes these paths, not this call, which never quotes under `-z`.
 * @returns {string[]}
 */
function listUntrackedFiles() {
  const out = runGit(['ls-files', '--others', '--exclude-standard', '-z']);
  return out.split('\0').filter((entry) => entry.length > 0);
}

function main() {
  const base = process.env.EMDASH_BASE || `origin/${readDefaultBranch()}`;

  let hasHead;
  try {
    hasHead = spawnGit(['rev-parse', '--verify', '-q', 'HEAD']).status === 0;
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const diffTexts = [];

  if (hasHead) {
    let logText;
    try {
      logText = runGit(['log', `${base}..HEAD`, '--format=%B']);
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }

    // The revert escape suppresses only the committed-range diff, just
    // below. The working-tree and untracked-file scans that follow always
    // still run: a dirty tree sitting on top of a reverted range must still
    // be caught.
    const reverted = hasRevertMarker(logText);
    if (reverted) {
      console.log(
        `check-emdash: revert marker found in ${base}..HEAD -- skipping the em-dash check for the committed range (revert escape); the working tree and untracked files are still scanned.`
      );
    } else {
      let committedDiff;
      try {
        committedDiff = runGit(['diff', '--no-color', '-U0', `${base}...HEAD`]);
      } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
        return;
      }
      diffTexts.push(committedDiff);
    }

    // Staged and unstaged changes together, in one diff, so `git diff
    // --cached` is never also collected here and no line is counted twice.
    let workingTreeDiff;
    try {
      workingTreeDiff = runGitDiffTolerant(['diff', '--no-color', '-U0', 'HEAD']);
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    diffTexts.push(workingTreeDiff);
  } else {
    // No commit exists yet (an unborn HEAD): there is no committed range and
    // no commit log to check for a revert marker. `git add` makes a file
    // tracked even with no commit to attach it to, so a file can be staged
    // here and *also* have unstaged, on-disk edits on top of that staged
    // copy; `git ls-files --others --exclude-standard` (the untracked-file
    // scan below) reports nothing for such a file, since tracked is exactly
    // what it now is. Two diffs are collected to cover it: `--cached` (empty
    // tree vs the index, i.e. what's staged) and a plain `diff` with no ref
    // (the index vs the on-disk worktree, i.e. what's staged plus whatever
    // is edited on top of it since). Together they see every uncommitted
    // tracked-file change; unlike `git diff HEAD`, they also catch staged
    // content that was since reverted on disk, since the `--cached` half
    // still sees it as newly staged even after the worktree copy no longer
    // carries it, which is the stricter behavior acceptance criterion 1
    // wants.
    let stagedDiff;
    try {
      stagedDiff = runGitDiffTolerant(['diff', '--no-color', '-U0', '--cached']);
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    diffTexts.push(stagedDiff);

    let unstagedDiff;
    try {
      unstagedDiff = runGitDiffTolerant(['diff', '--no-color', '-U0']);
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    diffTexts.push(unstagedDiff);
  }

  let untrackedFiles;
  try {
    untrackedFiles = listUntrackedFiles();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  if (untrackedFiles.length > MAX_UNTRACKED_FILES) {
    console.error(
      `check-emdash: ${untrackedFiles.length} untracked, non-gitignored files found, over the ${MAX_UNTRACKED_FILES}-file cap on the per-file git diff scan. Add a .gitignore entry for the untracked bulk (a build-output directory is the common cause), or raise MAX_UNTRACKED_FILES in scripts/check-emdash.js.`
    );
    process.exitCode = 1;
    return;
  }

  for (const rel of untrackedFiles) {
    let addDiff;
    try {
      addDiff = runGitDiffTolerant([
        'diff',
        '--no-index',
        '--no-color',
        '-U0',
        '--',
        '/dev/null',
        rel,
      ]);
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    diffTexts.push(addDiff);
  }

  // Each diff text is fed to findEmdashViolations separately, never
  // concatenated: findEmdashViolations builds one removed-line carry set
  // across whatever text it is handed, so concatenating would let a line
  // deleted in the committed range silently exempt the same line re-added as
  // uncommitted work.
  //
  // The file:line key below de-duplicates across diffs whose line numbers
  // come from different coordinate systems (the committed-range diff numbers
  // a line against HEAD's version of the file, the working-tree diff against
  // the file on disk right now): a genuinely separate working-tree violation
  // that happens to land on the same line number as a committed-range one in
  // the same file is under-counted, though never dropped below exit status
  // 1, so this cannot turn a real violation into a clean exit.
  const seen = new Set();
  const violations = [];
  for (const text of diffTexts) {
    for (const v of findEmdashViolations(text)) {
      const key = `${v.file}:${v.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push(v);
    }
  }

  if (violations.length === 0) {
    console.log('check-emdash: no added em dashes found.');
    process.exitCode = 0;
    return;
  }

  for (const v of violations) {
    console.log(`${v.file}:${v.line}`);
    console.log(
      `  remedy: rewrite the line without the em dash, or spell it as the ${ESCAPE_HINT} escape in source and test fixtures.`
    );
  }
  console.error(`check-emdash: ${violations.length} added em-dash line(s) found.`);
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}
