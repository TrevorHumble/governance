// tests/before-issue-create.test.js
// Vitest tests for _claude/hooks/before-issue-create.ps1: a PreToolUse hook that denies a Bash
// call filing a GitHub issue unless it carries the needs-issue-review label and a body holding
// the line "Owner-approved: yes". Each case feeds the PreToolUse JSON on stdin and reads the
// deny JSON (or nothing) from stdout. Launcher resolution: see tests/ps-launcher.js.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const SCRIPT = path.join(__dirname, '..', '_claude', 'hooks', 'before-issue-create.ps1');
const LABEL = 'needs-issue-review';
const LINE = 'Owner-approved: yes';

let dirs = [];

afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'before-issue-create-'));
  dirs.push(dir);
  return dir;
}

// Runs the hook on a Bash command (or on raw stdin when `raw` is given).
// Returns { decision, reason, stdout, status }: decision is 'deny' or 'allow' (no output).
function run(command, { cwd, raw } = {}) {
  const input =
    raw !== undefined ? raw : JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd });
  const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
    input,
    encoding: 'utf8',
  });
  const stdout = (r.stdout || '').trim();
  if (stdout === '') return { decision: 'allow', reason: '', stdout, status: r.status };
  const out = JSON.parse(stdout).hookSpecificOutput;
  return {
    decision: out.permissionDecision,
    reason: out.permissionDecisionReason,
    event: out.hookEventName,
    stdout,
    status: r.status,
  };
}

const maybeDescribe = launcherMissing
  ? describe.skip.bind(describe, skipTitle('before-issue-create'))
  : describe;

maybeDescribe('_claude/hooks/before-issue-create.ps1: gh issue create', () => {
  it('allows long flags with the label and the line, and prints nothing', () => {
    const res = run(`gh issue create --title "T" --body "${LINE}" --label ${LABEL}`);
    expect(res.decision).toBe('allow');
    expect(res.stdout).toBe('');
    expect(res.status).toBe(0);
  });

  it('denies in the shape goal-gate uses, naming the label and the owner first', () => {
    const res = run('gh issue create --title "T" --body "no line here"');
    expect(res.decision).toBe('deny');
    expect(res.event).toBe('PreToolUse');
    expect(res.status).toBe(0);
    expect(res.reason).toContain(LABEL);
    expect(res.reason).toContain(LINE);
    expect(res.reason).toContain("owner's yes comes first");
  });

  it('denies a missing label and says only the label is missing', () => {
    const res = run(`gh issue create --title "T" --body "${LINE}"`);
    expect(res.decision).toBe('deny');
    expect(res.reason).toContain(`it has no ${LABEL} label`);
    expect(res.reason).not.toContain("no 'Owner-approved: yes' line");
  });

  it('denies a missing line and says only the line is missing', () => {
    const res = run(`gh issue create --title "T" --body "text" --label ${LABEL}`);
    expect(res.decision).toBe('deny');
    expect(res.reason).toContain("no 'Owner-approved: yes' line");
    expect(res.reason).not.toContain(`it has no ${LABEL}`);
  });

  it('denies when both are missing and names both', () => {
    const res = run('gh issue create --title "T" --body "text"');
    expect(res.decision).toBe('deny');
    expect(res.reason).toContain(`it has no ${LABEL} label`);
    expect(res.reason).toContain("no 'Owner-approved: yes' line");
  });

  it('denies a label that only looks close, and a line that says no', () => {
    expect(run(`gh issue create --body "${LINE}" --label needs-review`).decision).toBe('deny');
    expect(run(`gh issue create --body "Owner-approved: no" --label ${LABEL}`).decision).toBe(
      'deny'
    );
    expect(run(`gh issue create --body "xOwner-approved: yes" --label ${LABEL}`).decision).toBe(
      'deny'
    );
  });

  it('reads the short flags -t -b -l', () => {
    expect(run(`gh issue create -t "T" -b "${LINE}" -l ${LABEL}`).decision).toBe('allow');
    expect(run(`gh issue create -t "T" -b "${LINE}" -l bug`).decision).toBe('deny');
  });

  it('reads flags written with = and attached short values', () => {
    expect(run(`gh issue create --body="${LINE}" --label=${LABEL}`).decision).toBe('allow');
    expect(run(`gh issue create -b"${LINE}" -l${LABEL}`).decision).toBe('allow');
  });

  it('reads comma-joined and repeated labels', () => {
    expect(
      run(`gh issue create --body "${LINE}" --label bug,${LABEL},owner-approved`).decision
    ).toBe('allow');
    expect(run(`gh issue create --body "${LINE}" --label bug --label ${LABEL}`).decision).toBe(
      'allow'
    );
    expect(run(`gh issue create --body "${LINE}" --label bug,docs`).decision).toBe('deny');
  });

  it('does not take a flag value for a flag: a title that looks like one', () => {
    const res = run(`gh issue create --title "--label ${LABEL}" --body "${LINE}"`);
    expect(res.decision).toBe('deny');
  });

  it('accepts the line anywhere in a multi-line body, not only the first line', () => {
    const body = `First line\n${LINE}\nlast`;
    expect(run(`gh issue create --label ${LABEL} --body '${body}'`).decision).toBe('allow');
  });

  it('reads a body written as a heredoc inside $( ), quotes and all', () => {
    const body = `${LINE}\n\nIt says "quoted" things and it's fine.`;
    const cmd = `gh issue create --title "T" --label ${LABEL} --body "$(cat <<'EOF'\n${body}\nEOF\n)"`;
    expect(run(cmd).decision).toBe('allow');
    const without = cmd.replace(LINE, 'No line');
    expect(run(without).decision).toBe('deny');
  });

  it('denies a body the shell builds with $( ), with a hint to use a file', () => {
    const res = run(`gh issue create --label ${LABEL} --body "$(cat body.md)"`);
    expect(res.decision).toBe('deny');
    expect(res.reason).toContain('--body-file');
  });

  it('reads a body file by absolute path and by path relative to the payload cwd', () => {
    const dir = scratch();
    fs.writeFileSync(path.join(dir, 'ok.md'), `${LINE}\nBody\n`);
    fs.writeFileSync(path.join(dir, 'bad.md'), 'Body only\n');
    const abs = path.join(dir, 'ok.md');
    expect(run(`gh issue create --label ${LABEL} --body-file ${abs}`).decision).toBe('allow');
    expect(run(`gh issue create --label ${LABEL} -F ok.md`, { cwd: dir }).decision).toBe('allow');
    expect(run(`gh issue create --label ${LABEL} --body-file bad.md`, { cwd: dir }).decision).toBe(
      'deny'
    );
    expect(run(`gh issue create --body-file ok.md`, { cwd: dir }).decision).toBe('deny');
  });

  it('reads a body file with Windows line endings', () => {
    const dir = scratch();
    fs.writeFileSync(path.join(dir, 'crlf.md'), `Top\r\n${LINE}\r\nBody\r\n`);
    const cmd = `gh issue create --label ${LABEL} --body-file crlf.md`;
    expect(run(cmd, { cwd: dir }).decision).toBe('allow');
  });

  it('denies a body file that does not exist, and says to write it first', () => {
    const dir = scratch();
    const res = run(`gh issue create --label ${LABEL} --body-file nope.md`, { cwd: dir });
    expect(res.decision).toBe('deny');
    expect(res.reason).toContain('nope.md');
    expect(res.reason).toContain('cannot be read');
  });

  it('denies a body from stdin and says to use a file', () => {
    const viaDash = run(`gh issue create --label ${LABEL} --body-file -`);
    expect(viaDash.decision).toBe('deny');
    expect(viaDash.reason).toContain('stdin');
    expect(viaDash.reason).toContain('--body-file <file>');
    const heredoc = run(`gh issue create --label ${LABEL} --body-file - <<'EOF'\n${LINE}\nEOF`);
    expect(heredoc.decision).toBe('deny');
    expect(heredoc.reason).toContain('stdin');
  });

  it('accepts the new alias for create', () => {
    expect(run(`gh issue new --body "${LINE}" --label ${LABEL}`).decision).toBe('allow');
    expect(run('gh issue new --body "x"').decision).toBe('deny');
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: gh api', () => {
  const ok = `-f labels[]=${LABEL} -f "body=${LINE}"`;

  it('allows a POST that carries the label and the line', () => {
    expect(run(`gh api -X POST repos/o/r/issues -f title=T ${ok}`).decision).toBe('allow');
    expect(run(`gh api --method POST repos/o/r/issues -f title=T ${ok}`).decision).toBe('allow');
    expect(run(`gh api repos/o/r/issues -f title=T -f "labels[]=bug" ${ok}`).decision).toBe(
      'allow'
    );
  });

  it('treats fields with no method as a POST (denied without the label and line)', () => {
    const res = run('gh api repos/o/r/issues -f title=T');
    expect(res.decision).toBe('deny');
    expect(res.reason).toContain(LABEL);
  });

  it('denies a POST missing the label, or missing the line', () => {
    expect(run(`gh api -X POST repos/o/r/issues -f title=T -f "body=${LINE}"`).decision).toBe(
      'deny'
    );
    expect(
      run(`gh api -X POST repos/o/r/issues -f title=T -f labels[]=${LABEL} -f body=x`).decision
    ).toBe('deny');
  });

  it('strips a leading slash and a query string from the endpoint', () => {
    expect(run(`gh api -X POST /repos/o/r/issues -f title=T`).decision).toBe('deny');
    expect(run(`gh api -X POST "repos/o/r/issues?x=1" -f title=T`).decision).toBe('deny');
    expect(run(`gh api -X POST /repos/o/r/issues ${ok}`).decision).toBe('allow');
  });

  it('passes a GET of the same endpoint, with or without fields', () => {
    expect(run('gh api repos/o/r/issues').decision).toBe('allow');
    expect(run('gh api -X GET repos/o/r/issues -f state=open').decision).toBe('allow');
    expect(run('gh api --method GET repos/o/r/issues -f state=open').decision).toBe('allow');
    expect(run('gh api repos/o/r/issues --paginate -q ".[].title"').decision).toBe('allow');
  });

  it('reads -F body=@file, and denies a file without the line', () => {
    const dir = scratch();
    fs.writeFileSync(path.join(dir, 'ok.md'), `${LINE}\nBody`);
    fs.writeFileSync(path.join(dir, 'bad.md'), 'Body');
    const base = `gh api -X POST repos/o/r/issues -f title=T -f labels[]=${LABEL}`;
    expect(run(`${base} -F body=@ok.md`, { cwd: dir }).decision).toBe('allow');
    expect(run(`${base} -F body=@bad.md`, { cwd: dir }).decision).toBe('deny');
    expect(run(`${base} -F body=@gone.md`, { cwd: dir }).decision).toBe('deny');
  });

  it('denies a body from stdin: body=@- and --input -', () => {
    const viaField = run(`gh api -X POST repos/o/r/issues -f labels[]=${LABEL} -F body=@-`);
    expect(viaField.decision).toBe('deny');
    expect(viaField.reason).toContain('stdin');
    const viaInput = run('gh api repos/o/r/issues --input -');
    expect(viaInput.decision).toBe('deny');
    expect(viaInput.reason).toContain('stdin');
  });

  it('reads an --input JSON file with and without the label and the line', () => {
    const dir = scratch();
    const write = (name, obj) => fs.writeFileSync(path.join(dir, name), JSON.stringify(obj));
    write('ok.json', { title: 'T', labels: [LABEL, 'bug'], body: `${LINE}\nBody` });
    write('objects.json', { title: 'T', labels: [{ name: LABEL }], body: LINE });
    write('nolabel.json', { title: 'T', labels: ['bug'], body: LINE });
    write('noline.json', { title: 'T', labels: [LABEL], body: 'Body' });
    write('bare.json', { title: 'T' });
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json');
    const call = (f) => run(`gh api repos/o/r/issues --input ${f}`, { cwd: dir });
    expect(call('ok.json').decision).toBe('allow');
    expect(call('objects.json').decision).toBe('allow');
    expect(call('nolabel.json').decision).toBe('deny');
    expect(call('noline.json').decision).toBe('deny');
    expect(call('bare.json').decision).toBe('deny');
    expect(call('broken.json').decision).toBe('deny');
    expect(call('missing.json').decision).toBe('deny');
  });

  it('passes calls that are not a create: comments, labels, PATCH, other endpoints', () => {
    expect(run('gh api -X POST repos/o/r/issues/5/comments -f body=hello').decision).toBe('allow');
    expect(run('gh api repos/o/r/issues/5/comments -f body=hello').decision).toBe('allow');
    expect(run('gh api -X POST repos/o/r/issues/5/labels -f "labels[]=bug"').decision).toBe(
      'allow'
    );
    expect(run('gh api -X PATCH repos/o/r/issues/5 -f state=closed').decision).toBe('allow');
    expect(run('gh api -X POST repos/o/r/pulls -f title=T').decision).toBe('allow');
    expect(run('gh api user').decision).toBe('allow');
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: everything else passes untouched', () => {
  it('passes gh issue list, edit, comment, view, close', () => {
    for (const cmd of [
      'gh issue list --label bug',
      `gh issue edit 5 --remove-label ${LABEL}`,
      'gh issue edit 5 --body "text"',
      'gh issue comment 5 --body "text"',
      'gh issue view 5',
      'gh issue close 5',
      'gh pr create --title T --body "text"',
      'gh label create owner-approved',
    ]) {
      const res = run(cmd);
      expect(res.decision, cmd).toBe('allow');
      expect(res.stdout).toBe('');
    }
  });

  it('passes an unrelated Bash call', () => {
    expect(run('npm test').decision).toBe('allow');
    expect(run('git status && ls -la').decision).toBe('allow');
  });

  it('passes a command that only mentions gh issue create in text', () => {
    expect(run('git commit -m "the hook blocks gh issue create without a label"').decision).toBe(
      'allow'
    );
    expect(run('echo "gh issue create"').decision).toBe('allow');
    expect(run("cat > notes.md <<'EOF'\ngh issue create --title T\nEOF").decision).toBe('allow');
    expect(run('grep -rn gh-issue-create docs/ # gh issue create').decision).toBe('allow');
  });

  it('passes empty, missing, and unparseable input', () => {
    expect(run('').decision).toBe('allow');
    expect(
      run(undefined, { raw: JSON.stringify({ tool_name: 'Bash', tool_input: {} }) }).decision
    ).toBe('allow');
    expect(run(undefined, { raw: 'not json at all' }).decision).toBe('allow');
    expect(run(undefined, { raw: '' }).decision).toBe('allow');
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: creates inside larger commands', () => {
  it('finds a create after &&, ;, a pipe, a newline, and a wrapper', () => {
    const create = 'gh issue create --title T --body "text"';
    for (const cmd of [
      `cd /tmp && ${create}`,
      `echo start; ${create}`,
      `${create} | tee out.txt`,
      `echo start\n${create}`,
      `GH_TOKEN=abc ${create}`,
      `env GH_TOKEN=abc ${create}`,
      `/usr/bin/gh issue create --title T`,
      `URL=$(${create})`,
      `if true; then ${create}; fi`,
    ]) {
      expect(run(cmd).decision, cmd).toBe('deny');
    }
  });

  it('allows a compliant create inside a larger command', () => {
    const create = `gh issue create --title T --label ${LABEL} --body "${LINE}"`;
    expect(run(`cd /tmp && ${create} 2>&1`).decision).toBe('allow');
    expect(run(`URL=$(${create}) && echo "$URL"`).decision).toBe('allow');
  });

  it('judges each create in a chain on its own', () => {
    const good = `gh issue create --label ${LABEL} --body "${LINE}"`;
    const bad = 'gh issue create --body "x"';
    expect(run(`${good} && ${bad}`).decision).toBe('deny');
  });
});
