# 11-ship

Push the branch and open the PR against the base:

```
gh pr create --base <base> --title "<title>" --body-file <file>
```

The body carries the implementer's decision lines, copied as written, so the owner can skim the calls made. Add the run's buildlog fragment to the branch before CI runs: `buildlog/README.md`.

Merge when CI is green. If it goes red, fix the cause and push; do not merge red. A model swap or a user-started skill edit takes the configuration lane: `pipeline/PIPELINE.md`.

Then close the issue: `gh issue close <N>`. If `shipMode` in `repo-profile.json` is `direct`, there is no PR: push the default branch and watch CI there.
