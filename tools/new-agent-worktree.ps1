# new-agent-worktree: give one file-mutating agent its own working directory on
# its own branch, sharing this repo's history via `git worktree add`. One working
# tree, one driver: two sessions sharing a folder can stash, revert, or
# switch-branch under each other's uncommitted work. The commit gate is live in
# the new worktree with zero extra config, since core.hooksPath=.githooks is a
# relative path in shared git config and .githooks/ is a tracked directory.
#
# Fetch-fresh, always, before any branch decision (a worktree built on a
# stale local default branch is exactly the failure this guards against).
param(
  [Parameter(Mandatory = $true)]
  [string]$Branch
)

$top = (& git rev-parse --show-toplevel 2>$null)
if (-not $top) { [Console]::Error.WriteLine('new-agent-worktree: not inside a git repo'); exit 1 }

. (Join-Path $PSScriptRoot 'repo-profile-core.ps1')
$DefaultBranch = Get-RepoProfileValue -Field 'defaultBranch'
$RemoteDefault = "origin/$DefaultBranch"

# Fetch first, unconditionally, before any branch decision. On failure, exit
# loud and create nothing: a confident worktree built on a possibly-stale
# view is exactly the failure this script exists to prevent.
& git fetch --quiet origin 2>$null
if ($LASTEXITCODE -ne 0) {
  [Console]::Error.WriteLine('new-agent-worktree: git fetch origin failed (offline?), refusing to create a worktree from a possibly-stale base. Reconnect and re-run.')
  exit 1
}

$repoName = Split-Path $top -Leaf
$parent = Split-Path $top -Parent
$slug = $Branch -replace '[\\/]', '-' -replace '[^A-Za-z0-9._-]', '-'
$path = Join-Path $parent "$repoName-$slug"

if (Test-Path $path) {
  [Console]::Error.WriteLine("new-agent-worktree: target path already exists: $path")
  exit 1
}

& git show-ref --verify --quiet "refs/heads/$Branch"
$branchExists = ($LASTEXITCODE -eq 0)

if ($branchExists) {
  # Resume path: check out the existing branch exactly as it is. No rebase,
  # merge, or reset: the fetch above only updated remote-tracking refs, so a
  # later `tools/check-freshness.ps1` run has a true remote default branch to
  # compare against, but this branch's own history is untouched.
  & git worktree add $path $Branch
} else {
  # New-branch path: base it on the remote default branch, not local HEAD, so it
  # is 0 commits behind at birth even when the primary checkout's local default
  # branch is stale.
  & git worktree add -b $Branch $path $RemoteDefault
}
$addExit = $LASTEXITCODE

if ($addExit -ne 0) {
  [Console]::Error.WriteLine("new-agent-worktree: 'git worktree add' failed (exit $addExit), see git's message above for the reason (e.g. branch already checked out elsewhere, or path in use). No worktree was created.")
  exit 1
}

$absPath = (Resolve-Path $path).Path
Write-Output "worktree ready: $absPath (branch '$Branch'). cd into it to work."
