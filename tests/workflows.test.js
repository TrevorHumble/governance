// tests/workflows.test.js
// Vitest tests that read the workflow files as text (no YAML parser is a dependency): the reusable
// governance-ci.yml runs the same `build` job as ci.yml, and dependabot-auto-merge.yml keeps
// its trigger, actor check, permissions, and pinned action.
'use strict';

const fs = require('fs');
const path = require('path');

const WORKFLOWS = path.join(__dirname, '..', '.github', 'workflows');
const read = (name) => fs.readFileSync(path.join(WORKFLOWS, name), 'utf8').replace(/\r\n/g, '\n');

// The lines of a text without comment-only lines or blank lines.
const code = (text) =>
  text
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('#'))
    .join('\n');

// The text of the whole `build` job (name, runs-on, if, env, steps): from its key to the end of the
// file. `build` is the last job in both files; the test below fails first if a job is added after it.
function buildJob(text) {
  const at = text.indexOf('\n  build:\n');
  return at === -1 ? undefined : code(text.slice(at));
}

// A workflow-level block (`env:`, `permissions:`): its key and indented lines, or '' when absent.
function topBlock(text, key) {
  const m = new RegExp(`^${key}:\\n(?: {2}.*\\n)+`, 'm').exec(code(text) + '\n');
  return m ? m[0] : '';
}

describe('governance-ci.yml', () => {
  const reusable = read('governance-ci.yml');
  const ci = read('ci.yml');

  it('is a reusable workflow', () => {
    expect(code(reusable)).toMatch(/^on:\n {2}workflow_call:$/m);
  });

  it('has the build job, and no other job, in both files', () => {
    for (const text of [reusable, ci]) {
      const jobs = code(text).match(/^ {2}[\w-]+:$/gm) ?? [];
      const afterJobs = code(text).split(/^jobs:$/m)[1];
      expect(afterJobs.match(/^ {2}[\w-]+:$/gm)).toEqual(['  build:']);
      expect(jobs).toContain('  build:');
    }
  });

  it('runs the same build job as ci.yml, with the same checkout depth and em-dash condition', () => {
    const a = buildJob(reusable);
    const b = buildJob(ci);
    expect(a).toBeDefined();
    expect(a).toBe(b);
    expect(a).toContain('fetch-depth: 0');
    expect(a).toContain(
      "if: github.event_name == 'pull_request' || github.event_name == 'merge_group'"
    );
    for (const script of [
      'test',
      'lint',
      'format:check',
      'check:budget',
      'check:banned',
      'check:seats',
      'check:design',
    ]) {
      expect(a).toMatch(new RegExp(`run: npm (run )?${script}$`, 'm'));
    }
    expect(a).toMatch(/run: npm run check:emdash$/m);
  });

  it('has the same workflow-level env and permissions as ci.yml', () => {
    expect(topBlock(reusable, 'permissions')).toBe(topBlock(ci, 'permissions'));
    expect(topBlock(reusable, 'permissions')).not.toBe('');
    expect(topBlock(reusable, 'env')).toBe(topBlock(ci, 'env'));
  });

  it('sees a difference in runs-on, an if, an env, or a workflow-level env', () => {
    const whole = (t) => buildJob(t);
    expect(whole(ci.replace('runs-on: ubuntu-latest', 'runs-on: windows-latest'))).not.toBe(
      whole(reusable)
    );
    expect(whole(ci.replace('  build:\n', "  build:\n    if: github.ref == 'x'\n"))).not.toBe(
      whole(reusable)
    );
    expect(whole(ci.replace('    steps:\n', '    env:\n      A: b\n    steps:\n'))).not.toBe(
      whole(reusable)
    );
    expect(topBlock(ci.replace('\njobs:\n', '\nenv:\n  A: b\n\njobs:\n'), 'env')).not.toBe(
      topBlock(reusable, 'env')
    );
  });

  it('fails the comparison when a step differs', () => {
    const changed = ci.replace('run: npm run check:banned', 'run: npm run check:banned -- --x');
    expect(buildJob(changed)).not.toBe(buildJob(reusable));
  });

  it('asks for read access only', () => {
    expect(code(reusable)).toMatch(/^permissions:\n {2}contents: read$/m);
  });
});

describe('dependabot-auto-merge.yml', () => {
  const text = read('dependabot-auto-merge.yml');
  const body = code(text);

  it('triggers on pull_request_target only', () => {
    expect(body).toMatch(/^on: pull_request_target$/m);
    expect(body).not.toMatch(/^\s+pull_request:/m);
  });

  it('runs only for the dependabot actor and a pull request Dependabot opened', () => {
    expect(body).toContain(
      "if: github.actor == 'dependabot[bot]' && github.event.pull_request.user.login == 'dependabot[bot]'"
    );
  });

  it('holds exactly contents: write and pull-requests: write', () => {
    expect(body).toMatch(/^permissions:\n {2}contents: write\n {2}pull-requests: write\n/m);
  });

  it('pins every action by a full commit SHA', () => {
    const uses = [...body.matchAll(/^\s*(?:- )?uses: (\S+)/gm)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    expect(uses.some((u) => u.startsWith('dependabot/fetch-metadata@'))).toBe(true);
  });

  it('merges with auto-merge and squash, and checks nothing out', () => {
    expect(body).toContain('gh pr merge --auto --squash');
    expect(body).not.toContain('actions/checkout');
  });
});
