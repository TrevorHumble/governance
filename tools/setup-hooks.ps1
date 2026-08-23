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
    # core.hooksPath pointing at .githooks does not mean either hook file is
    # actually there (a parent-owned path that never arrived is exactly what
    # this issue is about), so report what was actually found on disk rather
    # than asserting both are active on the strength of the git config alone.
    $found = @()
    if (Test-Path (Join-Path $top '.githooks/commit-msg')) { $found += 'commit-msg' }
    if (Test-Path (Join-Path $top '.githooks/pre-commit')) { $found += 'pre-commit' }
    if ($found.Count -eq 2) {
      Write-Output "core.hooksPath -> .githooks (commit-msg issue-reference and pre-commit ownership hooks found and active)"
    } elseif ($found.Count -eq 1) {
      Write-Output "core.hooksPath -> .githooks, but only $($found[0]) was found on disk -- the other hook is missing and will not run"
    } else {
      Write-Output "core.hooksPath -> .githooks, but no hook files were found on disk (.githooks/commit-msg, .githooks/pre-commit both missing) -- nothing will run"
    }
  } else {
    Write-Error 'setup-hooks: git config core.hooksPath failed'
    exit 1
  }
}
