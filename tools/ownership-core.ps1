# tools/ownership-core.ps1: staged-path helpers for .githooks/pre-commit, the
# parent-owned-path wall. Dot-source this file; do not run it directly
# (mirrors the -core.ps1 convention of tools/issue-core.ps1). Dot-sources
# tools/governance-sync-core.ps1 for Test-MatchesManifestEntry and
# Test-IsSyncBranch instead of inlining a second copy of either rule.
#
# Windows PowerShell 5.1-compatible: no ternary, no ??, no &&, no ||.

. (Join-Path $PSScriptRoot 'governance-sync-core.ps1')

# Get-StagedParentOwnedPath -- every currently-staged path (git diff
# --cached, NUL-safe for the same reason tools/issue-core.ps1's
# Test-StagedHasCode is; see .githooks/commit-msg's header comment) that
# Test-MatchesManifestEntry matches against $Manifest.sharedPaths.
#
# Throws when $Manifest carries no sharedPaths array (a missing property or
# an explicit null): Resolve-SharedSet already throws on this same
# corruption, and this wall must not be looser than that planner about the
# same manifest. Without this check, @($null) parameter-binds to the empty
# string on Test-MatchesManifestEntry's [string]$Entry, matches nothing, and
# a truncated manifest would silently disarm the wall forever.
function Get-StagedParentOwnedPath {
  param(
    [Parameter(Mandatory = $true)]
    $Manifest
  )
  $sharedPathsProp = $Manifest.PSObject.Properties['sharedPaths']
  if ($null -eq $sharedPathsProp -or $null -eq $sharedPathsProp.Value) {
    throw 'Get-StagedParentOwnedPath: governance-manifest.json has no sharedPaths array (corrupt manifest)'
  }
  # git's stderr lines, once redirected, arrive in PowerShell as
  # non-terminating NativeCommandError records; the caller (the pre-commit
  # hook) runs this whole script under $ErrorActionPreference = 'Stop', which
  # promotes any such record to terminating and aborts the scan on a plain
  # git warning, not just a real git failure. $LASTEXITCODE is the only
  # trustworthy signal of whether git itself failed, so the preference is
  # relaxed for just this one call and restored right after, and the exit
  # code is checked explicitly instead of leaning on the promoted error.
  $previousEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $z = "$(& git -c core.quotepath=false diff --cached -z --name-only 2>$null)"
  } finally {
    $ErrorActionPreference = $previousEap
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Get-StagedParentOwnedPath: git diff --cached failed with exit code $LASTEXITCODE"
  }
  $paths = @($z -split "`0" | Where-Object { $_ })
  $sharedPaths = @($sharedPathsProp.Value)
  $result = New-Object System.Collections.Generic.List[string]
  foreach ($p in $paths) {
    foreach ($entry in $sharedPaths) {
      if (Test-MatchesManifestEntry -Path $p -Entry $entry) {
        $result.Add($p)
        break
      }
    }
  }
  return @($result)
}
