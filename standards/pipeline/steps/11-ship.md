# 11: Ship

How the change reaches the default branch defers to `repo-profile.json`'s `shipMode` field:

- **`shipMode: "pr"`:** push the branch, which re-stamps the issue's `active-<N>-*` claim label,
  per `standards/issue-standards.md` § "The release rule": `git push -u origin <branch>`. Then
  open a pull request with the gh CLI at the path `repo-profile.json`'s `ghPath` field declares
  (default `gh`, on PATH): `gh pr create --body-file data/<body-file>`, the body shaped as
  `## Summary` and `## Test plan`. Watch CI to green.
- **`shipMode: "direct"`:** push the default branch (`git push`) so the commit is published; the
  push re-stamps the issue's `active-<N>-*` claim label, per `standards/issue-standards.md` §
  "The release rule". Then watch CI to green there, no branch or PR step.

The default branch is never knowingly left red: if CI goes red, fix the cause or revert the
commit before proceeding.

Write the per-ship fragment as a new file, `buildlog/<N>-<PR>.md` (`N` the issue number, `PR`
the pull request number, or the commit's short SHA in `direct` mode), and push it as a commit on
the same branch, so it carries its own identifier and the green CI run covers the final commit.
Contents are exactly one line, in the shape:

```
- YYYY-MM-DD - #N <summary> (PR #M). <evidence, recorded omissions, CI expectation>
```

The parenthetical closes the summary clause; it does not end the entry. Carry what shipped, why,
what review found, and what CI confirmed.

Once the review has passed and CI is green (and, for a declared Pre-review surface, once that
step has also reached explicit owner approval, or the process file's unchanged-artifact
exemption carries it, per `standards/pipeline/edge/unchanged-artifact-exemption.md`), merge (or,
in `direct` mode, consider the ship complete). The owner does not perform merges; owner control is
upstream (issue-speccing) and downstream (revert via git history).

Then `gh issue close <N>`, referencing the merged PR, or the commit in `direct` mode, and release
its `active-<N>-*` claim label, per `standards/issue-standards.md` § "The release rule".
