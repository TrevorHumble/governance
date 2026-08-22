# setup-hooks: activate the repo's committed git hooks. core.hooksPath is local
# config (not carried by a clone), so this must run once per working copy. The
# orchestrator's machine runs it; a fresh clone runs it before first commit.
#
# Dot-source this file to load Set-HooksPath without running the top-level guard
# below, keeping this file the single owner of the arming call.

function Set-HooksPath {
  param(
    [Parameter(Mandatory)]
    [string]$RepoRoot
  )
  $null = & git -C $RepoRoot config core.hooksPath .githooks
  return ($LASTEXITCODE -eq 0)
}

if ($MyInvocation.InvocationName -ne '.') {
  $top = (& git rev-parse --show-toplevel 2>$null)
  if (-not $top) { Write-Error 'setup-hooks: not inside a git repo'; exit 1 }
  if (Set-HooksPath -RepoRoot $top) {
    Write-Output "core.hooksPath -> .githooks (commit-msg issue-reference hook active)"
  } else {
    Write-Error 'setup-hooks: git config core.hooksPath failed'
    exit 1
  }
}
