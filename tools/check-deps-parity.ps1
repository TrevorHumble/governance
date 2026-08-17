# check-deps-parity: read-only check that what is actually installed under
# node_modules matches what package-lock.json resolved: the companion gap to
# tools/check-freshness.ps1 (that catches the *code* going stale; this catches
# the *installed dependencies* going stale). (An incident in the
# wedding-scavenger-hunt repo, issue #319: CI had tested a newer patch version
# of a native binary dependency for six-plus phases while the primary
# checkout's node_modules still held the old version, a critical
# image-processing dependency for that project, because nothing compared the
# installed binary against the lockfile.) Pure check, no side effects: it only
# reads package.json, package-lock.json, and node_modules/<pkg>/package.json.
# It never runs npm install/ci itself: reconciling a flagged mismatch is
# running `npm ci` to reinstall from the lockfile.

# ---- Helpers -----------------------------------------------------------------

# Get-InstalledVersion -- reads the "version" field out of
# node_modules/<Name>/package.json. Returns $null (never throws) when the
# package is not installed or its package.json is unreadable, so the caller
# can report "not installed" instead of crashing the whole check.
function Get-InstalledVersion {
  param(
    [string]$Name,
    [string]$RepoRoot
  )
  $pkgPath = Join-Path $RepoRoot "node_modules\$Name\package.json"
  if (-not (Test-Path $pkgPath)) {
    return $null
  }
  try {
    $json = Get-Content -Raw -Path $pkgPath | ConvertFrom-Json
    return $json.version
  } catch {
    return $null
  }
}

# Get-LockedVersion -- reads the version package-lock.json (lockfileVersion 3's
# flat "packages" map, keyed "node_modules/<name>") resolved for $Name. Returns
# $null when the lockfile has no entry for that path.
function Get-LockedVersion {
  param(
    [string]$Name,
    $LockPackages
  )
  if ($null -eq $LockPackages) {
    return $null
  }
  $entry = $LockPackages."node_modules/$Name"
  if ($null -eq $entry) {
    return $null
  }
  return $entry.version
}

# Read-LockPackages -- parses package-lock.json's "packages" map, working
# around a PowerShell 5.1 ConvertFrom-Json defect: npm lockfileVersion 3 keys
# the project root itself as "" inside "packages" (e.g. `"packages": { "":
# {"name": "my-project", ...}, "node_modules/some-pkg": {...} }`), and
# PS 5.1's ConvertFrom-Json cannot add a NoteProperty with an empty name --
# it throws 'Cannot process argument because the value of argument "name" is
# not valid' on the WHOLE document, before any node_modules/<pkg> entry is
# ever reached. Renaming just that one root key to a placeholder before
# parsing sidesteps the defect; every node_modules/<pkg> entry this script
# actually reads is untouched by the substitution.
function Read-LockPackages {
  param([string]$LockJsonPath)
  $raw = Get-Content -Raw -Path $LockJsonPath
  $patched = $raw -replace '("packages"\s*:\s*\{)\s*""\s*:', '$1 "__lockfile_root__":'
  $lockJson = $patched | ConvertFrom-Json
  return $lockJson.packages
}

# Get-ParityMismatches -- the single function both AC1 (mismatch/missing) and
# AC2 (full parity) run through, so "what counts as a mismatch" has exactly
# one owner and its behavior is traceable from a resolvable file path (no
# hidden global state). Returns a formatted description string per package
# that fails to match; an empty array means every $Names entry matched.
function Get-ParityMismatches {
  param(
    [string[]]$Names,
    $LockPackages,
    [string]$RepoRoot
  )
  $mismatches = @()
  foreach ($name in @($Names | Where-Object { $_ } | Select-Object -Unique)) {
    $installed = Get-InstalledVersion -Name $name -RepoRoot $RepoRoot
    $locked = Get-LockedVersion -Name $name -LockPackages $LockPackages
    if ($null -eq $installed -and $null -eq $locked) {
      $mismatches += "${name}: not installed AND not found in package-lock.json"
    } elseif ($null -eq $installed) {
      $mismatches += "${name}: NOT INSTALLED (locked: $locked)"
    } elseif ($null -eq $locked) {
      $mismatches += "${name}: installed $installed (not found in package-lock.json)"
    } elseif ($installed -ne $locked) {
      $mismatches += "${name}: installed $installed, locked $locked"
    }
  }
  return $mismatches
}

# ---- Executable body --------------------------------------------------------
# Runs only when this file is invoked directly, never when another script
# dot-sources it just to reuse the constants/functions above (matches
# tools/check-freshness.ps1's guard).
if ($MyInvocation.InvocationName -ne '.') {
  $repoRoot = Split-Path -Parent $PSScriptRoot
  $pkgJsonPath = Join-Path $repoRoot 'package.json'
  $lockJsonPath = Join-Path $repoRoot 'package-lock.json'

  if (-not (Test-Path $pkgJsonPath)) {
    [Console]::Error.WriteLine("check-deps-parity: package.json not found at $pkgJsonPath")
    exit 1
  }
  if (-not (Test-Path $lockJsonPath)) {
    [Console]::Error.WriteLine("check-deps-parity: package-lock.json not found at $lockJsonPath -- run npm install first.")
    exit 1
  }

  $pkgJson = Get-Content -Raw -Path $pkgJsonPath | ConvertFrom-Json
  $lockPackages = Read-LockPackages -LockJsonPath $lockJsonPath

  # package.json is the owner of both lists: no separate hardcoded dev-deps
  # list to fall out of sync with it. A missing dev dep means test files fail
  # to import (not that an assertion fails), so a local `npm test` would
  # silently under-report coverage without ever going red; checking every
  # declared dev dep, not a hand-picked subset, catches that regardless of
  # which package it is.
  $prodDeps = @()
  if ($pkgJson.dependencies) {
    $prodDeps = @($pkgJson.dependencies.PSObject.Properties | ForEach-Object { $_.Name })
  }
  $devDeps = @()
  if ($pkgJson.devDependencies) {
    $devDeps = @($pkgJson.devDependencies.PSObject.Properties | ForEach-Object { $_.Name })
  }

  $names = @($prodDeps + $devDeps)
  $mismatches = @(Get-ParityMismatches -Names $names -LockPackages $lockPackages -RepoRoot $repoRoot)

  if ($mismatches.Count -gt 0) {
    foreach ($m in $mismatches) {
      Write-Output "PARITY MISMATCH: $m"
    }
    exit 1
  }

  Write-Output 'up to date: installed dependencies match package-lock.json.'
  exit 0
}
