# tools/repo-profile-core.ps1: single-homed repo-profile.json reader. Dot-source
# this file; do not run it directly (mirrors the -core.ps1 convention of
# tools/issue-core.ps1 and tools/classify-dep-pr-core.ps1).
#
# Why this file exists instead of four private copies: DESIGN.md § "repo-profile.json
# schema" (the "tools/repo-profile-core.ps1" paragraph).
#
# Windows PowerShell 5.1-compatible: no ternary, no ??, no &&, no ||.

# FieldDefaults -- per-field fallback values a caller needs no -Default
# argument for; Get-RepoProfileValue supplies one automatically when the
# field is listed here. A field not listed here still requires -Default from
# the caller (or falls back to $null with none). 'main' was previously
# passed by hand as -Default 'main' from three separate tools; single-homed
# here instead.
$FieldDefaults = @{
  defaultBranch = 'main'
}

# Get-RepoProfileValue -- reads one field out of repo-profile.json, resolved
# at <this file's own directory>\..\repo-profile.json (the repo root), so
# every caller gets the same answer regardless of its own location under
# tools/. Returns $Default (or, if the caller omitted -Default, this file's
# own $FieldDefaults entry for $Field, if any) when the profile file does not
# exist, the field is absent, or the field's value is falsy (empty string,
# empty array, $null): a caller never has to separately null-check before
# using the result.
function Get-RepoProfileValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Field,
    $Default = $null
  )
  if (-not $PSBoundParameters.ContainsKey('Default') -and $FieldDefaults.ContainsKey($Field)) {
    $Default = $FieldDefaults[$Field]
  }
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
