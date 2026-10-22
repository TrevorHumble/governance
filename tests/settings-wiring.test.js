// tests/settings-wiring.test.js
// .claude/settings.json wires each hook script in .claude/hooks/ (other than hook-core.ps1, the
// shared library) exactly once, and every script a hook command names exists.
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const HOOK_DIR = path.join(REPO, '.claude', 'hooks');
const LIBRARY = 'hook-core.ps1';

// Every hook command in a settings object, whatever its event and matcher.
function commands(settings) {
  const out = [];
  for (const groups of Object.values(settings.hooks || {})) {
    for (const group of groups) {
      for (const hook of group.hooks || []) out.push(String(hook.command));
    }
  }
  return out;
}

// The .claude/hooks/*.ps1 names a command mentions, in order.
function named(command) {
  return [...command.matchAll(/\.claude\/hooks\/([A-Za-z0-9._-]+\.ps1)/g)].map((m) => m[1]);
}

// What is wrong with the wiring: commands that name no hook file or the library, names with no file
// on disk, and hook files (the library excepted) wired some number of times other than one.
function wiringProblems(settings, filesOnDisk) {
  const cmds = commands(settings);
  const wired = cmds.flatMap(named);
  const hookFiles = filesOnDisk.filter((f) => f.endsWith('.ps1') && f !== LIBRARY);
  return {
    unnamed: cmds.filter((c) => named(c).length !== 1),
    library: wired.filter((w) => w === LIBRARY),
    missing: wired.filter((w) => !filesOnDisk.includes(w)),
    notOnce: hookFiles.filter((f) => wired.filter((w) => w === f).length !== 1),
  };
}

const wiring = (...names) => ({
  hooks: { Stop: [{ hooks: names.map((n) => ({ command: `& "$env:X/.claude/hooks/${n}"` })) }] },
});
const NONE = { unnamed: [], library: [], missing: [], notOnce: [] };

describe('.claude/settings.json hook wiring', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8'));
  const onDisk = fs.readdirSync(HOOK_DIR);

  it('wires each hook file once, names no missing file, and does not wire hook-core.ps1', () => {
    expect(commands(settings).length).toBeGreaterThan(0);
    expect(wiringProblems(settings, onDisk)).toEqual(NONE);
  });

  it('finds a hook file that is wired twice', () => {
    const p = wiringProblems(wiring('a.ps1', 'a.ps1'), ['a.ps1', LIBRARY]);
    expect(p.notOnce).toEqual(['a.ps1']);
  });

  it('finds a hook file that is not wired', () => {
    const p = wiringProblems(wiring('a.ps1'), ['a.ps1', 'b.ps1', LIBRARY]);
    expect(p.notOnce).toEqual(['b.ps1']);
  });

  it('finds a command that names a file that does not exist', () => {
    const p = wiringProblems(wiring('a.ps1', 'ghost.ps1'), ['a.ps1', LIBRARY]);
    expect(p.missing).toEqual(['ghost.ps1']);
  });

  it('finds hook-core.ps1 wired, and a command that names no hook file', () => {
    const p = wiringProblems(wiring('a.ps1', LIBRARY), ['a.ps1', LIBRARY]);
    expect(p.library).toEqual([LIBRARY]);
    const q = wiringProblems({ hooks: { Stop: [{ hooks: [{ command: 'echo hi' }] }] } }, ['a.ps1']);
    expect(q.unnamed).toEqual(['echo hi']);
  });
});
