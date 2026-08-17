// scripts/buildlog-glue.js
// Thin CLI over scripts/buildlog-glue-core.js: reads pending
// buildlog/*.md fragments, folds them into BUILDLOG.md, verifies the write,
// and deletes only what it confirms landed. See buildlog/README.md for the
// fragment contract this implements. (Ported from the wedding-scavenger-hunt
// repo's issue #1184.)
'use strict';

const fs = require('fs');
const path = require('path');
const { foldFragments, verifyFolded } = require('./buildlog-glue-core');

/** `{name, rule}[]` -> `"name (rule), name (rule)"`. */
function describeRejected(rejected) {
  return rejected.map((r) => `${r.name} (${r.rule})`).join(', ');
}

/**
 * Folds every pending `<fragmentsDir>/*.md` fragment (excluding `README.md`)
 * into `archivePath`, verifies the write via `readBack`, and deletes only
 * the fragments confirmed present. On any verification failure the archive
 * is restored to its pre-append bytes and nothing is deleted.
 *
 * See buildlog/README.md for why `main` returns `{ code, message, rejected }`
 * instead of assigning `process.exitCode` or calling `process.exit` itself --
 * only the `require.main === module` guard below maps `code` onto the process.
 *
 * @param {{readBack?: typeof fs.readFileSync, fragmentsDir?: string, archivePath?: string}} [opts]
 * @returns {{code: number, message: string, rejected: {name: string, rule: string}[]}}
 */
function main(opts = {}) {
  const readBack = opts.readBack || fs.readFileSync;
  const fragmentsDir = opts.fragmentsDir || 'buildlog';
  const archivePath = opts.archivePath || 'BUILDLOG.md';

  let fragmentFiles;
  try {
    fragmentFiles = fs
      .readdirSync(fragmentsDir)
      .filter((name) => name.endsWith('.md') && name !== 'README.md');
  } catch (err) {
    return { code: 1, message: `could not read ${fragmentsDir}: ${err.message}`, rejected: [] };
  }

  if (fragmentFiles.length === 0) {
    return { code: 0, message: 'nothing to fold', rejected: [] };
  }

  let fragments;
  try {
    fragments = fragmentFiles.map((name) => ({
      name,
      text: fs.readFileSync(path.join(fragmentsDir, name), 'utf8'),
    }));
  } catch (err) {
    return { code: 1, message: `could not read fragment: ${err.message}`, rejected: [] };
  }

  let preAppendBytes;
  try {
    preAppendBytes = fs.readFileSync(archivePath, 'utf8');
  } catch (err) {
    return { code: 1, message: `could not read ${archivePath}: ${err.message}`, rejected: [] };
  }

  const result = foldFragments(preAppendBytes, fragments);

  if (result.consumed.length === 0) {
    return {
      code: 1,
      message: `nothing folded; all ${result.rejected.length} fragment(s) refused: ${describeRejected(result.rejected)}`,
      rejected: result.rejected,
    };
  }

  if (result.text !== preAppendBytes) {
    try {
      fs.writeFileSync(archivePath, result.text);
    } catch (err) {
      return {
        code: 1,
        message: `could not write ${archivePath}: ${err.message}`,
        rejected: result.rejected,
      };
    }
  }

  let diskText;
  try {
    diskText = readBack(archivePath, 'utf8');
  } catch (err) {
    return {
      code: 1,
      message: `could not read back ${archivePath}: ${err.message}; archive may hold the unverified append, do not commit`,
      rejected: result.rejected,
    };
  }

  const { deletable, missing } = verifyFolded(diskText, result.consumed);

  if (missing.length > 0) {
    try {
      fs.writeFileSync(archivePath, preAppendBytes);
    } catch (err) {
      return {
        code: 1,
        message: `verification failed for ${missing.join(', ')}; restore failed too: ${err.message}; archive is inconsistent, do not commit`,
        rejected: result.rejected,
      };
    }

    // A write call reporting success is not proof the bytes landed -- the
    // same reason the post-append write is re-read and verified above. Read
    // the restore back too, rather than trusting it blind.
    let restoredText;
    try {
      restoredText = readBack(archivePath, 'utf8');
    } catch (err) {
      return {
        code: 1,
        message: `verification failed for ${missing.join(', ')}; archive restore could not be confirmed (read-back failed: ${err.message}), do not commit`,
        rejected: result.rejected,
      };
    }

    if (restoredText !== preAppendBytes) {
      return {
        code: 1,
        message: `verification failed for ${missing.join(', ')}; restore unverified, archive bytes do not match the pre-append state, do not commit`,
        rejected: result.rejected,
      };
    }

    return {
      code: 1,
      message: `verification failed for ${missing.join(', ')}; archive restored, nothing deleted.`,
      rejected: result.rejected,
    };
  }

  const unlinkErrors = [];
  for (const name of deletable) {
    try {
      fs.unlinkSync(path.join(fragmentsDir, name));
    } catch (err) {
      unlinkErrors.push(`${name}: ${err.message}`);
    }
  }

  if (unlinkErrors.length > 0) {
    return {
      code: 1,
      message: `folded but could not delete: ${unlinkErrors.join('; ')}`,
      rejected: result.rejected,
    };
  }

  const parts = [`folded ${deletable.length} fragment(s): ${deletable.join(', ')}`];
  if (result.rejected.length > 0) {
    parts.push(`refused: ${describeRejected(result.rejected)}`);
  }
  if (result.outOfOrder.length > 0) {
    parts.push(`out-of-order (warning): ${result.outOfOrder.join(', ')}`);
  }

  return { code: 0, message: parts.join('; '), rejected: result.rejected };
}

if (require.main === module) {
  const result = main();
  if (result.code === 0) {
    console.log(result.message);
  } else {
    console.error(result.message);
  }
  process.exitCode = result.code;
}

module.exports = { main };
