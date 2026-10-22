// tests/before-issue-create.test.js
// Tests for _claude/hooks/before-issue-create.ps1.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PS, launcherMissing, skipTitle } = require('./ps-launcher');

const HOOKS = path.join(__dirname, '..', '_claude', 'hooks');
const SCRIPT = path.join(HOOKS, 'before-issue-create.ps1');
const LABEL = 'needs-issue-review';
const LINE = 'Owner-approved: yes';

let dir;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'before-issue-create-'));
  fs.writeFileSync(path.join(dir, 'ok.md'), `${LINE}\r\nBody\r\n`);
  fs.writeFileSync(path.join(dir, 'bom.md'), `\uFEFF${LINE}\nBody\n`);
  fs.writeFileSync(path.join(dir, 'bad.md'), 'Body only\n');
  fs.writeFileSync(path.join(dir, 'late.md'), `Top\n${LINE}\n`);
  fs.writeFileSync(path.join(dir, 'big.md'), `${LINE}\n${'x'.repeat(3 * 1024 * 1024)}`);
  fs.mkdirSync(path.join(dir, 'sub'));
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// Runs the hook on a Bash command (or on raw stdin). Returns { decision, event, reason }: decision is
// 'allow' when the hook printed nothing (event and reason are then undefined) or 'deny' when it did.
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
      ])
    ).toEqual(['allow', 'allow', 'allow']);
  });

  it('accepts the new alias, with a trailing redirect', () => {
    expect(run(`gh issue new --label ${LABEL} --body-file ok.md 2>&1`).decision).toBe('allow');
  });

  it('reads a relative file from the payload cwd, not from a cd earlier in the command (documented gap)', () => {
    expect(run(`cd /tmp && gh issue create --label ${LABEL} --body-file "ok.md"`).decision).toBe(
      'allow'
    );
  });

  it('denies a missing label, a wrong label, a missing line, and says which', () => {
    const noLabel = run(create('--body-file ok.md'));
    expect(noLabel.decision).toBe('deny');
    expect(noLabel.reason).toContain(`no ${LABEL} label`);
    expect(run(create(`--label bug --body-file ok.md`)).decision).toBe('deny');
    const noLine = run(create(`--label ${LABEL} --body-file bad.md`));
    expect(noLine.decision).toBe('deny');
    expect(noLine.reason).toContain("first line of 'bad.md' is not 'Owner-approved: yes'");
  });

  it('denies a missing body file, a directory, and a body from stdin', () => {
    const missing = run(create(`--label ${LABEL} --body-file nope.md`));
    expect(missing.decision).toBe('deny');
    expect(missing.reason).toContain('nope.md');
    expect(run(create(`--label ${LABEL} --body-file sub`)).decision).toBe('deny');
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

maybeDescribe('_claude/hooks/before-issue-create.ps1: the reason text', () => {
  const noteText = () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', '_claude', 'hooks', 'notes.md'),
      'utf8'
    );
    const m = /^## before-issue-create[ \t]*\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(text);
    return m[1].trim().replace(/\s*\r?\n\s*/g, ' ');
  };

  it('is the notes.md text, with the reason, label, and first line filled in', () => {
    const res = run(create(`--label ${LABEL} --body "${LINE}"`));
    expect(res.reason).toBe(
      `before-issue-create: ${noteText()
        .replace('{why}', 'its body is inline')
        .replace('{label}', LABEL)
        .replace('{line}', LINE)}`
    );
  });

  it('still denies, with one generic line, when notes.md or hook-core.ps1 cannot be read', () => {
    const lone = fs.mkdtempSync(path.join(os.tmpdir(), 'before-issue-create-lone-'));
    try {
      const copy = path.join(lone, 'before-issue-create.ps1');
      fs.copyFileSync(SCRIPT, copy);
      const input = JSON.stringify({
        tool_input: { command: 'gh issue create --title T' },
        cwd: dir,
      });
      const reasonOf = () => {
        const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', copy], {
          input,
          encoding: 'utf8',
        });
        expect(r.status).toBe(0);
        const out = JSON.parse(r.stdout).hookSpecificOutput;
        expect(out.permissionDecision).toBe('deny');
        return out.permissionDecisionReason;
      };
      const generic = 'before-issue-create: denied; see _claude/hooks/notes.md.';
      expect(reasonOf()).toBe(generic);
      fs.copyFileSync(path.join(HOOKS, 'hook-core.ps1'), path.join(lone, 'hook-core.ps1'));
      expect(reasonOf()).toBe(generic);
    } finally {
      fs.rmSync(lone, { recursive: true, force: true });
    }
  });

  it('does not fill a placeholder twice: a reason holding {label} stays as written', () => {
    // The body-file name lands in the reason through $why; a name that reads like a placeholder
    // must not be filled in a second time.
    const res = run(create(`--label ${LABEL} --body-file {line}.md`));
    expect(res.reason).toContain("the body file '{line}.md' is missing");
    expect(res.reason).not.toContain("'Owner-approved: yes'.md");
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

  it('passes empty, missing, and unparseable input', () => {
    expect(run('').decision).toBe('allow');
    expect(run(undefined, { raw: JSON.stringify({ tool_input: {} }) }).decision).toBe('allow');
    expect(run(undefined, { raw: 'not json at all' }).decision).toBe('allow');
    expect(run(undefined, { raw: '' }).decision).toBe('allow');
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: where gh can appear', () => {
  const exe = '"C:\\Program Files\\GitHub CLI\\gh.exe"';

  it('sees a create behind a path, .exe, quotes, the call operator, a prefix, or a line break', () => {
    const rest = 'issue create --title T --body x';
    expect(
      decisions([
        `${exe} ${rest}`,
        `& ${exe} ${rest}`,
        `/usr/local/bin/gh ${rest}`,
        `GH_TOKEN=abc gh ${rest}`,
        `echo hi\ngh ${rest}`,
        `(gh ${rest})`,
        `ls || gh ${rest}`,
        `timeout 30 gh ${rest}`,
        `gh \\\n${rest}`,
      ])
    ).toEqual(Array(9).fill('deny'));
  });

  it('judges a quoted-program create by the one form', () => {
    expect(run(`${exe} issue create --label ${LABEL} --body-file ok.md`).decision).toBe('allow');
    expect(run(`${exe} issue create --label ${LABEL} --body-file bad.md`).decision).toBe('deny');
  });

  it('allows -R and --repo between issue and the verb, and still judges the create', () => {
    expect(run(`gh issue -R o/r create --label ${LABEL} --body-file ok.md`).decision).toBe('allow');
    expect(run(`gh issue --repo=o/r create --label ${LABEL} --body-file ok.md`).decision).toBe(
      'allow'
    );
    expect(run('gh issue -R o/r create --title T').decision).toBe('deny');
  });
});

maybeDescribe(
  '_claude/hooks/before-issue-create.ps1: one issue per call, one call per segment',
  () => {
    const good = `gh issue create --label ${LABEL} --body-file ok.md`;

    it('denies more than one create in one call, even when each is compliant', () => {
      const chained = run(`${good} && ${good}`);
      expect(chained.decision).toBe('deny');
      expect(chained.reason).toContain('names issue creation more than once');
      expect(run(`${good}; gh issue new --title T`).decision).toBe('deny');
      expect(run(`${good} && gh api -X POST repos/o/r/issues -f title=T`).decision).toBe('deny');
    });

    it('denies a compliant create whose title names issue creation, and says how to file it', () => {
      const res = run(
        `gh issue create --title "fix gh issue create" --label ${LABEL} --body-file ok.md`
      );
      expect(res.decision).toBe('deny');
      expect(res.reason).toContain('names issue creation more than once');
      expect(res.reason).toContain('neutral title');
      expect(res.reason).toContain('gh issue edit <N> --title');
    });

    it('allows the rename the advice names: a title read from a file, in gh issue edit', () => {
      expect(run('gh issue edit 5 --title "$(cat title.txt)"').decision).toBe('allow');
    });

    it('opens every deny without claiming the call files an issue', () => {
      const reasons = [
        run('git commit -m "note gh issue create"').reason,
        run(`gh issue create --label ${LABEL} --body-file bad.md`).reason,
        run('gh api -X POST repos/o/r/issues -f title=T').reason,
      ];
      for (const r of reasons) {
        expect(r).toContain('This command names issue creation, so it is judged as a filing:');
        expect(r).not.toContain('this call files an issue');
      }
    });

    it('reads flags only from the create itself, not from the words around it', () => {
      expect(
        decisions([
          `gh issue create --title "drop the -b flag" --label ${LABEL} --body-file ok.md`,
          `${good} 2>&1 | grep -B 2 error`,
          `${good} && grep -b x notes.md`,
          `echo --label ${LABEL} && gh issue create --title T --body-file ok.md`,
        ])
      ).toEqual(['allow', 'allow', 'allow', 'deny']);
    });

    it('does not take a label or body flag from inside a quoted title', () => {
      expect(
        decisions([
          `gh issue create --title "--label ${LABEL}" --body-file ok.md`,
          `gh issue create --title "x" --label ${LABEL} --body-file ok.md --body "inline"`,
        ])
      ).toEqual(['deny', 'deny']);
    });

    it('reads flags case-sensitively', () => {
      expect(run(`gh issue create --label ${LABEL.toUpperCase()} --body-file ok.md`).decision).toBe(
        'deny'
      );
      expect(run(`gh issue create -L ${LABEL} --body-file ok.md`).decision).toBe('deny');
    });
  }
);

maybeDescribe('_claude/hooks/before-issue-create.ps1: gh api reads its own call', () => {
  it('takes the method from that call, not from a later command', () => {
    expect(
      decisions([
        'gh api -X GET repos/o/r/issues -f state=open && curl -X POST example.com',
        'gh api repos/o/r/issues; gh api -X POST repos/o/r/issues/5/comments -f body=x',
        'gh api repos/o/r/issues | xargs -f list.txt',
      ])
    ).toEqual(['allow', 'allow', 'allow']);
    expect(run('gh api repos/o/r/issues -XPOST -f title=T').decision).toBe('deny');
    expect(run('gh api repos/o/r/issues --method=POST').decision).toBe('deny');
  });

  it('catches a full https URL for the issues endpoint, and only that endpoint', () => {
    expect(run('gh api -X POST https://api.github.com/repos/o/r/issues -f title=T').decision).toBe(
      'deny'
    );
    expect(
      run('gh api -X POST https://git.example/api/v3/repos/o/r/issues -f title=T').decision
    ).toBe('deny');
    expect(
      run('gh api -X POST https://api.github.com/repos/o/r/issues/5/comments -f body=x').decision
    ).toBe('allow');
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: the body file', () => {
  const withFile = (f) => create(`--label ${LABEL} --body-file ${f}`);

  it('requires the line to be the first line, with CRLF and a BOM allowed', () => {
    expect(decisions([withFile('ok.md'), withFile('bom.md')])).toEqual(['allow', 'allow']);
    expect(run(withFile('late.md')).decision).toBe('deny');
  });

  it('reads no more than 1 MB of a large file', () => {
    expect(run(withFile('big.md')).decision).toBe('allow');
  });

  it.skipIf(process.platform !== 'linux')('allows the call when reading the file throws', () => {
    // /proc/self/mem exists as a file but fails with an I/O error on read.
    expect(run(withFile('/proc/self/mem')).decision).toBe('allow');
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: a call with one word after the verb', () => {
  it('still judges it: =-joined and attached flags, and a lone flag', () => {
    expect(
      decisions([
        'gh issue create --body-file=bad.md',
        'gh issue create -Fbad.md',
        'gh issue create --body=inline',
        'gh issue create --title=T',
        `gh issue create --label=${LABEL}`,
      ])
    ).toEqual(Array(5).fill('deny'));
  });

  it('takes an empty =value as the value, not the next word', () => {
    expect(run(create(`--label ${LABEL} -F ok.md --milestone= -F bad.md`)).decision).toBe('deny');
    expect(run(create(`--label ${LABEL} --title= --body-file ok.md`)).decision).toBe('allow');
    expect(run(create(`--label ${LABEL} -m= -F bad.md -F ok.md`)).decision).toBe('allow');
  });

  it('allows the one form written with = and attached values', () => {
    expect(run(`gh issue create --label=${LABEL} --body-file=ok.md`).decision).toBe('allow');
    expect(run(`gh issue create -l${LABEL} -Fok.md`).decision).toBe('allow');
  });

  it('keeps the last --body-file, as gh does', () => {
    expect(run(create(`--label ${LABEL} --body-file bad.md --body-file ok.md`)).decision).toBe(
      'allow'
    );
    expect(run(create(`--label ${LABEL} --body-file ok.md -F bad.md`)).decision).toBe('deny');
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: it fails closed on mentions', () => {
  const heredoc = (q) => `git commit -m "$(cat <<${q}\nblocks gh issue create calls\nEOF\n)"`;

  it('denies text that only mentions creating an issue, and points to a file or Grep', () => {
    const mentions = [
      'git commit -m "fix gh issue create handling"',
      "git commit -m 'blocks `gh issue create` without a label'",
      'grep -rn "gh issue create" .',
      'rg "(gh issue create|gh issue new)" docs',
      'echo gh issue create',
      heredoc("'EOF'"),
      heredoc('EOF'),
    ];
    expect(decisions(mentions)).toEqual(Array(7).fill('deny'));
    const res = run(mentions[0]);
    expect(res.reason).toContain('written with the Write tool');
    expect(res.reason).toContain('git commit -F <file>');
    expect(res.reason).toContain('Grep tool');
    expect(res.reason).toContain(`gh issue create --label ${LABEL} --body-file <file>`);
  });

  it('does not read gh inside another word, or other gh commands, as a create', () => {
    expect(
      decisions(['echo high issue create', 'echo ugh issue created', 'echo gh issue create-x'])
    ).toEqual(['allow', 'allow', 'allow']);
  });

  it('still denies a real create after an apostrophe, a comment, or an ANSI-C string', () => {
    expect(
      decisions([
        `echo "it's fine" && gh issue create --title T`,
        `echo it's && gh issue create --title T`,
        `# don't stop\ngh issue create --title T`,
        `echo $'it\\'s' && gh issue create --title T`,
        `git commit -m "$(cat <<EOF\nit's a note\nEOF\n)" && gh issue create --title T`,
        'echo "$(gh issue create --title T --body x)"',
      ])
    ).toEqual(Array(6).fill('deny'));
  });

  it('judges a create by its own segment when the title has an escaped apostrophe', () => {
    const own = `gh issue create --title it\\'s --label ${LABEL} --body-file`;
    expect(run(`${own} ok.md ; echo -F bad.md`).decision).toBe('allow');
    expect(run(`${own} bad.md ; echo -F ok.md`).decision).toBe('deny');
  });

  it('reads a single-quoted label and body file in a real create', () => {
    expect(run(`gh issue create --label '${LABEL}' --body-file 'ok.md'`).decision).toBe('allow');
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: program name', () => {
  it('matches the program name in any case, but not the verb', () => {
    expect(
      decisions([
        'GH issue create --title T',
        'Gh.exe issue create --title T',
        'gh ISSUE create --title T',
      ])
    ).toEqual(['deny', 'deny', 'allow']);
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: caps on the work it does', () => {
  it('denies a command longer than the text cap, unread', () => {
    const res = run(`echo ${'a'.repeat(10001)}`);
    expect(res.decision).toBe('deny');
    expect(res.reason).toContain('longer than 10000 characters');
  });

  it('allows a long command that is under the cap and does not name gh', () => {
    expect(run(`echo ${'a '.repeat(4000)}`).decision).toBe('allow');
  });

  it('denies a command that names gh more than 12 times, even when no call is a create', () => {
    const res = run('gh api x '.repeat(13));
    expect(res.decision).toBe('deny');
    expect(res.reason).toContain('names gh more than 12 times');
    expect(run('gh api x ; '.repeat(12)).decision).toBe('allow');
  });

  it('finishes well inside the 10 s timeout on a 6 KB adversarial command', () => {
    // Twelve gh api words (the most the cap lets through), then 6 KB of words with no separator,
    // so each gh api scans to the end of the text.
    const command = 'gh api x '.repeat(12) + 'a '.repeat(2900);
    expect(command.length).toBeGreaterThan(5900);
    const started = Date.now();
    expect(run(command).decision).toBe('allow');
    expect(Date.now() - started).toBeLessThan(6000);
    const started2 = Date.now();
    expect(run('gh api x '.repeat(700)).decision).toBe('deny');
    expect(Date.now() - started2).toBeLessThan(6000);
  });
});

maybeDescribe('_claude/hooks/before-issue-create.ps1: the body file must be a regular file', () => {
  const withFile = (f) => create(`--label ${LABEL} --body-file ${f}`);

  it('allows a regular file and a link to one', () => {
    fs.symlinkSync(path.join(dir, 'ok.md'), path.join(dir, 'link.md'));
    try {
      expect(run(withFile('link.md')).decision).toBe('allow');
    } finally {
      fs.rmSync(path.join(dir, 'link.md'), { force: true });
    }
  });

  it.skipIf(process.platform !== 'linux')('denies a pipe without opening it', () => {
    const fifo = path.join(dir, 'pipe.md');
    const made = spawnSync('mkfifo', [fifo]);
    expect(made.status).toBe(0);
    try {
      const started = Date.now();
      const res = run(withFile(fifo));
      expect(res.decision).toBe('deny');
      expect(res.reason).toContain('is not a regular file');
      expect(Date.now() - started).toBeLessThan(6000);
    } finally {
      fs.rmSync(fifo, { force: true });
    }
  });

  it.skipIf(process.platform !== 'linux')('denies a device and a link to one', () => {
    expect(run(withFile('/dev/null')).reason).toContain('is not a regular file');
    fs.symlinkSync('/dev/null', path.join(dir, 'null-link.md'));
    try {
      expect(run(withFile('null-link.md')).decision).toBe('deny');
    } finally {
      fs.rmSync(path.join(dir, 'null-link.md'), { force: true });
    }
  });

  it.skipIf(process.platform !== 'linux')('denies a link that points nowhere', () => {
    fs.symlinkSync(path.join(dir, 'gone.md'), path.join(dir, 'dangling.md'));
    try {
      expect(run(withFile('dangling.md')).decision).toBe('deny');
    } finally {
      fs.rmSync(path.join(dir, 'dangling.md'), { force: true });
    }
  });
});

maybeDescribe(
  '_claude/hooks/before-issue-create.ps1: gh api filing (the cloud session way)',
  () => {
    const api = (fields, head = 'gh api repos/{owner}/{repo}/issues') => `${head} ${fields}`;
    const ok = `-f title=T -F body=@ok.md -f 'labels[]=${LABEL}'`;

    it('passes the REST command the cloud session uses', () => {
      expect(
        run(api(`-f title=T -F body=@ok.md -f 'labels[]=${LABEL}' -f 'labels[]=owner-approved'`))
          .decision
      ).toBe('allow');
    });

    it('passes the other ways to write the same fields', () => {
      expect(
        decisions([
          api(ok, 'gh api -X POST repos/o/r/issues'),
          api(`-f title=T --field body=@ok.md --raw-field "labels[]=${LABEL}"`),
          api(`-f title=T --field=body=@ok.md --field=labels[]=${LABEL}`),
          api(`-f title=T -Fbody=@ok.md -F labels[]=${LABEL}`),
          api(`-f title=T -f=labels[]=${LABEL} -F "body=@ok.md"`),
          api(`-f title=T -F body=@${path.join(dir, 'ok.md')} -f labels[]=${LABEL}`),
          api(`-f title=T -F body=@ok.md -f labels[]=${LABEL} --jq .html_url -H 'X-Y: z'`),
        ])
      ).toEqual(Array(7).fill('allow'));
    });

    it('denies a call without the label, and says so', () => {
      const res = run(api('-f title=T -F body=@ok.md -f labels[]=bug'));
      expect(res.decision).toBe('deny');
      expect(res.reason).toContain(`it has no ${LABEL} label`);
      expect(run(api('-f title=T -F body=@ok.md')).decision).toBe('deny');
      expect(run(api(`-f title=T -F body=@ok.md -f labels=${LABEL}`)).decision).toBe('deny');
      expect(
        run(api(`-f title=T -F body=@ok.md -f 'labels[]=${LABEL.toUpperCase()}'`)).decision
      ).toBe('deny');
    });

    it('denies an inline body, however it is sent', () => {
      for (const body of [
        `-f "body=${LINE}"`,
        `-F "body=${LINE}"`,
        `--raw-field body=@ok.md`,
        `-f body=@ok.md`,
      ]) {
        const res = run(api(`-f title=T ${body} -f 'labels[]=${LABEL}'`));
        expect(res.decision).toBe('deny');
        expect(res.reason).toContain('its body is inline');
      }
    });

    it('denies a body file whose first line is wrong, missing, or not a regular file', () => {
      const bad = run(api(`-f title=T -F body=@bad.md -f 'labels[]=${LABEL}'`));
      expect(bad.reason).toContain("first line of 'bad.md' is not 'Owner-approved: yes'");
      const gone = run(api(`-f title=T -F body=@nope.md -f 'labels[]=${LABEL}'`));
      expect(gone.reason).toContain('nope.md');
      expect(run(api(`-f title=T -F body=@sub -f 'labels[]=${LABEL}'`)).decision).toBe('deny');
    });

    it.skipIf(process.platform !== 'linux')('denies a device as the body file', () => {
      const res = run(api(`-f title=T -F body=@/dev/null -f 'labels[]=${LABEL}'`));
      expect(res.reason).toContain('is not a regular file');
    });

    it('denies --input and a body from stdin, with a note', () => {
      const input = run(api(`-f title=T --input body.json -f 'labels[]=${LABEL}'`));
      expect(input.decision).toBe('deny');
      expect(input.reason).toContain('--input');
      expect(run(api(`--input=body.json -f 'labels[]=${LABEL}'`)).decision).toBe('deny');
      const stdin = run(api(`-f title=T -F body=@- -f 'labels[]=${LABEL}'`));
      expect(stdin.decision).toBe('deny');
      expect(stdin.reason).toContain('stdin');
    });

    it('denies two body fields, and two issue POSTs in one command', () => {
      expect(run(api(`-F body=@ok.md -F body=@ok.md -f 'labels[]=${LABEL}'`)).reason).toContain(
        'more than one body field'
      );
      const twice = run(`${api(ok)} && ${api(ok)}`);
      expect(twice.decision).toBe('deny');
      expect(twice.reason).toContain('names issue creation more than once');
      expect(run(`${api(ok)}; gh issue create --label ${LABEL} --body-file ok.md`).decision).toBe(
        'deny'
      );
    });

    it('does not take a label from a word that is the value of another flag', () => {
      expect(run(api(`-F body=@ok.md --jq 'labels[]=${LABEL}'`)).decision).toBe('deny');
      expect(run(api(`-F body=@ok.md -H -f labels[]=${LABEL}`)).decision).toBe('deny');
      expect(run(api(`-F body=@ok.md -- -f labels[]=${LABEL}`)).decision).toBe('deny');
    });

    it('keeps passing a GET and the other endpoints, with no label needed', () => {
      expect(
        decisions([
          'gh api repos/{owner}/{repo}/issues',
          'gh api repos/{owner}/{repo}/issues/5/comments -f body=hi',
          'gh api -X PATCH repos/o/r/issues/5 -f state=closed',
        ])
      ).toEqual(['allow', 'allow', 'allow']);
    });
  }
);
