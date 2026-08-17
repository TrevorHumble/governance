# tools/classify-dep-pr-core.ps1: shared tier-classification logic for
# Dependabot-shaped dependency bumps. Dot-source this file; do not run it
# directly (mirrors the -core.ps1 convention of tools/issue-core.ps1). Single
# source of truth for the auto/review precedence rules, reused by
# tools/classify-dep-pr.ps1. Policy: .claude/rules/dependencies.md and
# DESIGN.md § "Hazards from the classification report: disposition" (hazard 3).
#
# Windows PowerShell 5.1-compatible: no ternary, no ??, no &&, no ||.

# Critical-dependency list: a bad bump to one of these breaks a path this repo
# depends on. Read from an env override first (CRITICAL_DEPS_JSON, a JSON array
# string; the test seam), then repo-profile.json's criticalDependencies field,
# defaulting to an empty list. Single-homed: .claude/rules/dependencies.md
# points here and at repo-profile.json instead of asserting its own copy.
$CriticalDeps = @()
if ($env:CRITICAL_DEPS_JSON) {
  # No @() wrapper around the pipeline: ConvertFrom-Json already returns a
  # single Object[] for a JSON array (it does not enumerate onto the
  # pipeline in Windows PowerShell 5.1), so wrapping it in @() would nest it
  # inside a second one-element array instead of flattening it.
  $parsed = $env:CRITICAL_DEPS_JSON | ConvertFrom-Json
  if ($null -ne $parsed) { $CriticalDeps = @($parsed) }
} else {
  . (Join-Path $PSScriptRoot 'repo-profile-core.ps1')
  $CriticalDeps = @(Get-RepoProfileValue -Field 'criticalDependencies' -Default @())
}

# Get-DepPrTier: classifies a single dependency bump into 'auto' or 'review'.
# Precedence (evaluated top-down, first match wins):
#   1. github-actions bumps -> auto
#   2. dev-dependency bumps -> auto (CI catches a broken build)
#   3. critical prod dep (any semver) -> review
#   4. prod major bump -> review
#   5. everything else -> auto
function Get-DepPrTier {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('github-actions', 'npm')][string]$Ecosystem,
    [Parameter(Mandatory = $true)][string]$DepName,
    [Parameter(Mandatory = $true)][ValidateSet('patch', 'minor', 'major')][string]$SemverBump,
    [Parameter(Mandatory = $true)][ValidateSet('prod', 'dev')][string]$DepType
  )

  if ($Ecosystem -eq 'github-actions') {
    return 'auto'
  }
  if ($DepType -eq 'dev') {
    return 'auto'
  }
  if ($CriticalDeps -contains $DepName) {
    return 'review'
  }
  if ($SemverBump -eq 'major') {
    return 'review'
  }
  return 'auto'
}
