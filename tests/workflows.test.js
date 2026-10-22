// tests/workflows.test.js
// Vitest tests that read the workflow files as text (no YAML parser is a dependency): the reusable
// governance-ci.yml runs the same steps as ci.yml's `build` job, and dependabot-auto-merge.yml keeps
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

// The text of the `build` job's steps: from its `steps:` line to the end of the file. `build` is the
// last job in both files; the test below fails first if a job is added after it.
function buildSteps(text) {
  const at = text.indexOf('\n    steps:\n');
  return at === -1 ? undefined : code(text.slice(at));
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

  it('runs the same steps as ci.yml build, with the same checkout depth and em-dash condition', () => {
    const a = buildSteps(reusable);
    const b = buildSteps(ci);
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
    ]) {
      expect(a).toMatch(new RegExp(`run: npm (run )?${script}$`, 'm'));
    }
    expect(a).toMatch(/run: npm run check:emdash$/m);
  });

  it('fails the comparison when a step differs', () => {
    const changed = ci.replace('run: npm run check:banned', 'run: npm run check:banned -- --x');
    expect(buildSteps(changed)).not.toBe(buildSteps(reusable));
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

  it('runs only for the dependabot actor', () => {
    expect(body).toContain("if: github.actor == 'dependabot[bot]'");
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
