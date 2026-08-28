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
  # NUL-safe git output via Invoke-GitCaptureRaw (this file already
  # dot-sources tools/governance-sync-core.ps1, per the header). No
  # -WorkingDirectory: this wall always runs against the invoking tree.
  # Rationale and the byte guarantee this actually gives: the governance
  # repo's DESIGN.md § "NUL-safe git output: one home".
  $capture = Invoke-GitCaptureRaw -ArgumentList @('-c', 'core.quotepath=false', 'diff', '--cached', '-z', '--name-only')
  if ($capture.ExitCode -ne 0) {
    throw "Get-StagedParentOwnedPath: git diff --cached failed with exit code $($capture.ExitCode)"
  }
  $z = $capture.Output
  $lastNul = $z.LastIndexOf([char]0)
  $paths = @()
  if ($lastNul -ge 0) {
    $paths = @($z.Substring(0, $lastNul) -split "`0")
  }
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
