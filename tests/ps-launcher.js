// tests/ps-launcher.js
// Shared PowerShell-launcher probe for the test suite.
// Probes `powershell` then `pwsh`, matching the order .githooks/commit-msg
// itself probes in, so every suite needing a launcher agrees on which one.
'use strict';

const { execFileSync } = require('child_process');

function probe() {
  for (const candidate of ['powershell', 'pwsh']) {
    try {
      execFileSync(candidate, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'exit 0']);
      return candidate;
    } catch (e) {
      if (e.code !== 'ENOENT') {
        return candidate;
      }
    }
  }
  return null;
}

const resolved = probe();

// Single home for the skip title every suite renders when neither launcher
// resolves. Interpolating `PS` (null in exactly this case) into a per-suite
// string was the old approach; this states what was actually looked for.
function skipTitle(suiteLabel) {
  return `neither powershell nor pwsh found, skipping ${suiteLabel} tests`;
}

module.exports = {
  // The resolved launcher name ('powershell' or 'pwsh'), or null if neither
  // is on PATH. Callers that spawn PowerShell themselves need this.
  PS: resolved,
  // Callers that never spawn PS directly (e.g. commit-msg's hook re-resolves
  // its own launcher) should use this instead of deriving it from PS.
  launcherMissing: resolved === null,
  skipTitle,
};
