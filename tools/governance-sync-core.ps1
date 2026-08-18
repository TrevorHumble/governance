# tools/governance-sync-core.ps1: pure planning logic for pulling shared governance
# from the home repo into a child. Dot-source this file; do not run it directly
# (mirrors the -core.ps1 convention of tools/repo-profile-core.ps1 and
# tools/classify-dep-pr-core.ps1). No side effects beyond reading the filesystem
# and, in Resolve-GhPath, probing commands: every git/gh mutation lives in the
# wrapper, tools/governance-sync.ps1, not here, so this file's functions can be
# dot-sourced and called directly from tests with no repo state at risk.
#
# Design and the same-tree invariant this plan feeds: the governance repo's
# DESIGN.md § "Governance sync".
#
# Windows PowerShell 5.1-compatible: no ternary, no ??, no &&, no ||.

# Get-FileSha256 -- SHA-256 of a file's bytes, lowercase hex. Get-FileHash's
# .Hash is uppercase; the retired-entry schema (tests/governance-manifest.test.js)
# requires lowercase, so every producer and consumer of a sha256 value agrees on
# case without a caller having to remember to normalize it.
function Get-FileSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )
  $hash = Get-FileHash -LiteralPath $Path -Algorithm SHA256
  return $hash.Hash.ToLowerInvariant()
}

# ConvertTo-RepoRelativeSlash -- absolute path under $RootFull, repo-relative,
# forward-slashed, matching the form every manifest entry and plan output uses
# (git's own path convention, cross-platform even though this tool's launcher
# is PowerShell).
function ConvertTo-RepoRelativeSlash {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FullPath,
    [Parameter(Mandatory = $true)]
    [string]$RootFull
  )
  $root = $RootFull
  if (-not $root.EndsWith([IO.Path]::DirectorySeparatorChar)) {
    $root = $root + [IO.Path]::DirectorySeparatorChar
  }
  $rel = $FullPath.Substring($root.Length)
  return ($rel -replace '\\', '/')
}

# Resolve-SharedSet -- expands $Manifest.sharedPaths into the concrete list of
# repo-relative, forward-slashed file paths that actually exist under
# $TreeRoot. A "dir/**" entry resolves to every file at or below dir that
# exists at resolve time (an absent directory resolves to zero files, not an
# error: a wildcard entry never goes stale as files are added or removed
# beneath it). A bare entry resolves to itself when the file exists and THROWS
# otherwise: a bare sharedPaths entry naming a file the parent tree does not
# actually have is manifest corruption, and silently skipping it would sync a
# child a smaller set than the manifest promises with no signal that anything
# was wrong.
function Resolve-SharedSet {
  param(
    [Parameter(Mandatory = $true)]
    $Manifest,
    [Parameter(Mandatory = $true)]
    [string]$TreeRoot
  )
  $rootFull = (Resolve-Path -LiteralPath $TreeRoot).ProviderPath
  $result = New-Object System.Collections.Generic.List[string]
  foreach ($entry in @($Manifest.sharedPaths)) {
    if ($entry.EndsWith('/**')) {
      $prefix = $entry.Substring(0, $entry.Length - 3)
      $dirPath = Join-Path $rootFull ($prefix -replace '/', [IO.Path]::DirectorySeparatorChar)
      if (Test-Path -LiteralPath $dirPath -PathType Container) {
        $files = Get-ChildItem -LiteralPath $dirPath -Recurse -File -Force
        foreach ($f in $files) {
          $result.Add((ConvertTo-RepoRelativeSlash -FullPath $f.FullName -RootFull $rootFull))
        }
      }
      # Directory absent under this tree: zero files under it, not an error.
    } else {
      $filePath = Join-Path $rootFull ($entry -replace '/', [IO.Path]::DirectorySeparatorChar)
      if (Test-Path -LiteralPath $filePath -PathType Leaf) {
        $result.Add($entry)
      } else {
        throw "Resolve-SharedSet: sharedPaths entry '$entry' does not resolve to a file under $TreeRoot (corrupt manifest)"
      }
    }
  }
  return @($result | Select-Object -Unique)
}

# Get-SyncPlan -- classifies a parent/child diff into Adds, Updates, Prunes,
# and RetainedDivergent by content, never by count; see standards/governance-sync.md
# for what each classification means to the reviewer.
function Get-SyncPlan {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ParentRoot,
    [Parameter(Mandatory = $true)]
    [string]$ChildRoot,
    [Parameter(Mandatory = $true)]
    $Manifest
  )
  $parentFull = (Resolve-Path -LiteralPath $ParentRoot).ProviderPath
  $childFull = (Resolve-Path -LiteralPath $ChildRoot).ProviderPath
  $sharedFiles = Resolve-SharedSet -Manifest $Manifest -TreeRoot $parentFull

  $adds = New-Object System.Collections.Generic.List[string]
  $updates = New-Object System.Collections.Generic.List[string]
  $identicalCount = 0

  foreach ($rel in $sharedFiles) {
    $parentPath = Join-Path $parentFull ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
    $childPath = Join-Path $childFull ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $childPath -PathType Leaf)) {
      $adds.Add($rel)
    } elseif ((Get-FileSha256 -Path $parentPath) -ne (Get-FileSha256 -Path $childPath)) {
      $updates.Add($rel)
    } else {
      $identicalCount++
    }
  }

  $prunes = New-Object System.Collections.Generic.List[string]
  $retainedDivergent = New-Object System.Collections.Generic.List[string]
  foreach ($retired in @($Manifest.retired)) {
    $childPath = Join-Path $childFull ($retired.path -replace '/', [IO.Path]::DirectorySeparatorChar)
    if (Test-Path -LiteralPath $childPath -PathType Leaf) {
      if ((Get-FileSha256 -Path $childPath) -eq $retired.sha256) {
        $prunes.Add($retired.path)
      } else {
        $retainedDivergent.Add($retired.path)
      }
    }
    # Absent in the child: appears in neither Prunes nor RetainedDivergent.
  }

  $warnings = New-Object System.Collections.Generic.List[string]
  $childClaudeMd = Join-Path $childFull 'CLAUDE.md'
  $hasHeading = $false
  if (Test-Path -LiteralPath $childClaudeMd -PathType Leaf) {
    $content = Get-Content -LiteralPath $childClaudeMd -Raw
    if ($content -match '(?m)^## Governing-artifact surface\s*$') {
      $hasHeading = $true
    }
  }
  if (-not $hasHeading) {
    $warnings.Add("child CLAUDE.md is missing the literal heading '## Governing-artifact surface'")
  }

  return [PSCustomObject]@{
    Adds              = @($adds)
    Updates           = @($updates)
    IdenticalCount    = $identicalCount
    Prunes            = @($prunes)
    RetainedDivergent = @($retainedDivergent)
    Warnings          = @($warnings)
  }
}

# Resolve-GhPath -- the gh resolution chain (a)-(d) below. Rationale for the
# probe order and each guard: the governance repo's DESIGN.md § "Governance
# sync" (the gh resolution chain paragraph).
function Resolve-GhPath {
  param(
    [string]$ProfileGhPath
  )
  if ($ProfileGhPath) {
    $cmd = Get-Command $ProfileGhPath -ErrorAction SilentlyContinue
    if ($cmd) {
      return $cmd.Source
    }
  }

  if ($env:GH_PATH -and (Test-Path -LiteralPath $env:GH_PATH -PathType Leaf)) {
    return $env:GH_PATH
  }

  if ($env:ProgramFiles) {
    $vendorDefault = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'
    if (Test-Path -LiteralPath $vendorDefault -PathType Leaf) {
      return $vendorDefault
    }
  }

  throw "Resolve-GhPath: could not resolve gh. Probed: profile value '$ProfileGhPath' (Get-Command), `$env:GH_PATH ('$($env:GH_PATH)'), and the vendor default install location under `$env:ProgramFiles. Set GH_PATH to the gh executable's path."
}
