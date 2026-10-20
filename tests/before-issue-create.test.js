// tests/before-issue-create.test.js
// Vitest tests for _claude/hooks/before-issue-create.ps1: a PreToolUse hook that allows filing an
// issue in one form only (`gh issue create`, the needs-issue-review label, and a body file holding
// the line "Owner-approved: yes") and denies every other create. Each case feeds the PreToolUse
// JSON on stdin and reads the deny JSON (or nothing) from stdout. Launcher: tests/ps-launcher.js.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const SCRIPT = path.join(__dirname, '..', '_claude', 'hooks', 'before-issue-create.ps1');
const LABEL = 'needs-issue-review';
const LINE = 'Owner-approved: yes';

let dir;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'before-issue-create-'));
  fs.writeFileSync(path.join(dir, 'ok.md'), `Top\r\n${LINE}\r\nBody\r\n`);
  fs.writeFileSync(path.join(dir, 'bad.md'), 'Body only\n');
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// Runs the hook on a Bash command (or on raw stdin). Returns 'allow' (no output) or the deny reason.
function run(command, { raw } = {}) {
  const input = raw !== undefined ? raw : JSON.stringify({ tool_input: { command }, cwd: dir });
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
    input,
    encoding: 'utf8',
  });
  expect(r.status).toBe(0);
  const out = (r.stdout || '').trim();
  if (out === '') return { decision: 'allow' };
  const parsed = JSON.parse(out).hookSpecificOutput;
  return {
    decision: parsed.permissionDecision,
    event: parsed.hookEventName,
    reason: parsed.permissionDecisionReason,
  };
}

const decisions = (cmds) => cmds.map((c) => run(c).decision);
const create = (flags) => `gh issue create --title "T" ${flags}`;

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('before-issue-create'))
  : describe;

maybeDescribe('_claude/hooks/before-issue-create.ps1: the one accepted form', () => {
  it('allows the label plus a body file holding the line, with no output', () => {
    const res = run(create(`--label ${LABEL} --body-file ok.md`));
    expect(res).toEqual({ decision: 'allow' });
  });

  it('allows the short flags, comma-joined and repeated labels, and an absolute path', () => {
    expect(
      decisions([
        create(`-l ${LABEL} -F ok.md`),
        create(`--label bug,${LABEL} --body-file ok.md`),
        create(`--label bug --label ${LABEL} --body-file ${path.join(dir, 'ok.md')}`),
        `gh issue new --label ${LABEL} --body-file ok.md`,
        `cd /tmp && gh issue create --label ${LABEL} --body-file "ok.md" 2>&1`,
      ])
    ).toEqual(['allow', 'allow', 'allow', 'allow', 'allow']);
  });

  it('denies a missing label, a wrong label, a missing line, and says which', () => {
    const noLabel = run(create('--body-file ok.md'));
    expect(noLabel.decision).toBe('deny');
    expect(noLabel.reason).toContain(`no ${LABEL} label`);
    expect(run(create(`--label bug --body-file ok.md`)).decision).toBe('deny');
    const noLine = run(create(`--label ${LABEL} --body-file bad.md`));
    expect(noLine.decision).toBe('deny');
    expect(noLine.reason).toContain("no 'Owner-approved: yes' line");
  });

  it('denies a missing or unreadable body file and a body from stdin', () => {
    const missing = run(create(`--label ${LABEL} --body-file nope.md`));
    expect(missing.decision).toBe('deny');
    expect(missing.reason).toContain('nope.md');
    const stdin = run(create(`--label ${LABEL} --body-file -`));
    expect(stdin.decision).toBe('deny');
    expect(stdin.reason).toContain('stdin');
    expect(run(create(`--label ${LABEL}`)).decision).toBe('deny');
  });

  it('denies an inline body, even with the label and the line', () => {
    expect(
      decisions([
        create(`--label ${LABEL} --body "${LINE}"`),
        create(`-l ${LABEL} -b "${LINE}"`),
        create(`--label ${LABEL} --body="${LINE}" --body-file ok.md`),
      ])
    ).toEqual(['deny', 'deny', 'deny']);
  });

  it('names the one form and puts the owner first in every deny', () => {
    const res = run(create(`--label ${LABEL} --body "${LINE}"`));
    expect(res.event).toBe('PreToolUse');
    expect(res.reason).toContain(`gh issue create --label ${LABEL} --body-file <file>`);
    expect(res.reason).toContain("owner's yes comes first");
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: creates that hide in the text', () => {
  it('denies a create inside a quoted $( ), backticks, a chain, or a wrapper', () => {
    const bare = 'gh issue create --title T --body "x"';
    expect(
      decisions([
        `URL="$(${bare})"`,
        `echo \`${bare}\``,
        `cd /tmp && ${bare}`,
        `${bare} | tee out.txt`,
        `GH_TOKEN=abc ${bare}`,
        `env GH_TOKEN=abc /usr/bin/gh issue create --title T`,
      ])
    ).toEqual(['deny', 'deny', 'deny', 'deny', 'deny', 'deny']);
  });

  it('denies a quoted create even when it names the right form for the wrong file', () => {
    expect(run(`URL="$(${create(`--label ${LABEL} --body-file bad.md`)})"`).decision).toBe('deny');
  });

  it('allows a quoted create that follows the one form', () => {
    expect(run(`URL="$(${create(`--label ${LABEL} --body-file ok.md`)})"`).decision).toBe('allow');
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: gh api', () => {
  const fields = `-f title=T -f labels[]=${LABEL} -f "body=${LINE}"`;

  it('denies a POST to the issues endpoint, by method or by fields', () => {
    const res = run(`gh api -X POST repos/o/r/issues ${fields}`);
    expect(res.decision).toBe('deny');
    expect(res.reason).toContain('gh api');
    expect(
      decisions([
        `gh api --method POST repos/o/r/issues ${fields}`,
        `gh api repos/o/r/issues ${fields}`,
        `gh api -X POST /repos/o/r/issues -f title=T`,
        `gh api -X POST "repos/o/r/issues?x=1" -f title=T`,
        `gh api repos/o/r/issues --input body.json`,
        `gh api repos/o/r/issues --input -`,
      ])
    ).toEqual(['deny', 'deny', 'deny', 'deny', 'deny', 'deny']);
  });

  it('passes a GET, and the comments, labels, PATCH, and pulls endpoints', () => {
    expect(
      decisions([
        'gh api repos/o/r/issues',
        'gh api -X GET repos/o/r/issues -f state=open',
        'gh api --method GET repos/o/r/issues -f state=open',
        'gh api -X POST repos/o/r/issues/5/comments -f body=hello',
        'gh api repos/o/r/issues/5/comments -f body=hello',
        'gh api -X POST repos/o/r/issues/5/labels -f "labels[]=bug"',
        'gh api -X PATCH repos/o/r/issues/5 -f state=closed',
        'gh api -X POST repos/o/r/pulls -f title=T',
      ])
    ).toEqual(Array(8).fill('allow'));
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: everything else passes', () => {
  it('passes gh issue list, edit, comment, and an unrelated Bash call', () => {
    expect(
      decisions([
        'gh issue list --label bug',
        `gh issue edit 5 --remove-label ${LABEL}`,
        'gh issue comment 5 --body "text"',
        'gh pr create --title T --body "text"',
        'npm test',
      ])
    ).toEqual(Array(5).fill('allow'));
  });

  it('passes a git command that only mentions the create command', () => {
    expect(
      decisions([
        'git commit -m "the hook blocks gh issue create without a label"',
        'git commit -m "$(cat <<\'EOF\'\nfix gh issue create handling\nEOF\n)"',
      ])
    ).toEqual(['allow', 'allow']);
  });

  it('passes empty, missing, and unparseable input', () => {
    expect(run('').decision).toBe('allow');
    expect(run(undefined, { raw: JSON.stringify({ tool_input: {} }) }).decision).toBe('allow');
    expect(run(undefined, { raw: 'not json at all' }).decision).toBe('allow');
    expect(run(undefined, { raw: '' }).decision).toBe('allow');
  });
});
