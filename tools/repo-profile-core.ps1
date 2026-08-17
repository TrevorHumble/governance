# tools/repo-profile-core.ps1: single-homed repo-profile.json reader. Dot-source
# this file; do not run it directly (mirrors the -core.ps1 convention of
# tools/issue-core.ps1 and tools/classify-dep-pr-core.ps1).
#
# Before this file existed, four PowerShell tools (tools/check-freshness.ps1,
# tools/new-agent-worktree.ps1, tools/apply-branch-protection.ps1,
# tools/classify-dep-pr-core.ps1) each carried its own copy of "resolve
# repo-profile.json's path, read it if present, fall back to a default if
# missing or the field is absent" -- two different resolution strategies
# (three read relative to $PSScriptRoot, one read relative to `git
# rev-parse --show-toplevel`). This file is the single owner now; the four
# tools dot-source it and delete their private copies.
#
# Windows PowerShell 5.1-compatible: no ternary, no ??, no &&, no ||.

# Get-RepoProfileValue -- reads one field out of repo-profile.json, resolved
# at <this file's own directory>\..\repo-profile.json (the repo root), so
# every caller gets the same answer regardless of its own location under
# tools/. Returns $Default when the profile file does not exist, the field
# is absent, or the field's value is falsy (empty string, empty array,
# $null): a caller never has to separately null-check before using the
# result.
function Get-RepoProfileValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Field,
    $Default = $null
  )
  $profilePath = Join-Path $PSScriptRoot '..\repo-profile.json'
  if (-not (Test-Path $profilePath)) {
    return $Default
  }
  try {
    $repoProfile = Get-Content $profilePath -Raw | ConvertFrom-Json
  } catch {
    return $Default
  }
  $value = $repoProfile.$Field
  if ($null -eq $value) {
    return $Default
  }
  if ($value -is [string] -and $value -eq '') {
    return $Default
  }
  if (($value -is [array] -or $value -is [System.Collections.ICollection]) -and $value.Count -eq 0) {
    return $Default
  }
  return $value
}
