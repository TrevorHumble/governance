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

# Get-ManifestEntryPrefix -- decodes one manifest entry's "/**" suffix: the
# prefix when $Entry ends "/**", $null otherwise. The one place that decode
# lives, so Test-MatchesManifestEntry and Resolve-SharedSet share it instead
# of each carrying its own copy of the same Substring/EndsWith pair.
function Get-ManifestEntryPrefix {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Entry
  )
  if ($Entry.EndsWith('/**')) {
    return $Entry.Substring(0, $Entry.Length - 3)
  }
  return $null
}

# Test-MatchesManifestEntry -- true when $Path is matched by one manifest
# path entry: a "prefix/**" entry matches the prefix itself or anything
# nested below it; any other entry matches only by exact equality. The same
# rule tests/governance-manifest.test.js's matchesManifestEntry implements in
# JS, kept in this one PowerShell home so tools/ownership-core.ps1 has a real
# function to dot-source instead of a third hand-copy of the rule.
function Test-MatchesManifestEntry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Entry
  )
  $prefix = Get-ManifestEntryPrefix -Entry $Entry
  if ($null -ne $prefix) {
    return (($Path -eq $prefix) -or $Path.StartsWith("$prefix/"))
  }
  return ($Path -eq $Entry)
}

# New-SyncBranchName / Test-IsSyncBranch -- the sync branch name
# template (issue-<N>-governance-sync-<shortSha>) and its recognizer, kept
# in this one home so tools/governance-sync.ps1 (the builder) and
# tools/ownership-core.ps1 (the recognizer, via Test-IsSyncBranch below)
# cannot drift apart: a rename in only one place would either break the
# sync PR's own commit against the wall the exemption exists for, or open a
# hole the wall never closes.
function New-SyncBranchName {
  param(
    [Parameter(Mandatory = $true)]
    [int]$SyncIssue,
    [Parameter(Mandatory = $true)]
    [string]$ShortSha
  )
  return "issue-$SyncIssue-governance-sync-$ShortSha"
}

# Test-IsSyncBranch -- true when $Branch matches the shape New-SyncBranchName
# builds. Case-sensitive (-cmatch): the builder emits lowercase only, and git
# branch names are case-sensitive, so a case-insensitive match would exempt a
# mixed-case branch the sync itself can never produce. The caller resolves
# the branch name itself (e.g. via git symbolic-ref --short HEAD) and passes
# it in, so a detached HEAD yields an empty string here and falls through to
# $false rather than being treated as exempt from the wall.
function Test-IsSyncBranch {
  param(
    [string]$Branch
  )
  if (-not $Branch) { return $false }
  return ($Branch -cmatch '^issue-\d+-governance-sync-')
}

# Get-UnacknowledgedDivergent -- $Plan.RetainedDivergent minus every path the
# child declares under repo-profile.json's acknowledgedDivergentPaths (AC7).
# Pure planning logic, so it lives here rather than the side-effecting
# wrapper; the one filter both a real run's warning loop and its divergence
# issue (and the sync PR body) read, so none of them can disagree on what
# counts as unacknowledged.
function Get-UnacknowledgedDivergent {
  param(
    [Parameter(Mandatory = $true)] $Plan,
    [string[]]$Acknowledged
  )
  $ackSet = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($p in @($Acknowledged)) { [void]$ackSet.Add($p) }
  # A $null RetainedDivergent needs its own branch: piping $null straight into
  # Where-Object still runs the filter once with $null as the item
  # (PowerShell does not treat piping $null as piping nothing), and
  # $ackSet.Contains($null) is false, so that phantom $null would survive the
  # filter as a one-element result. @()-wrapping RetainedDivergent first does
  # not fix this either: @($null) is a one-element array holding $null, not
  # an empty one, the same trap tools/governance-sync.ps1 already documents
  # at its `gh pr list` parsing. Only an explicit $null check before the pipe
  # gets a real empty array out of a $null plan field.
  $retained = if ($null -eq $Plan.RetainedDivergent) { @() } else { @($Plan.RetainedDivergent) }
  # @()-wrapping the RESULT of the pipe is also not enough on its own: a
  # `return` (or any bare output) unrolls an array onto the pipeline element
  # by element, and an empty array unrolls to zero elements, which the
  # caller's assignment collapses back to $null. The leading comma makes the
  # array itself the single pipeline object, so a zero-count result still
  # arrives at the caller as a real empty array, on both Windows PowerShell
  # 5.1 and PowerShell 7.
  return ,@($retained | Where-Object { -not $ackSet.Contains($_) })
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
    $prefix = Get-ManifestEntryPrefix -Entry $entry
    if ($null -ne $prefix) {
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

# ConvertTo-CanonicalValue -- recursively sorts a PSCustomObject's property
# names alphabetically; array elements are canonicalized in place but their
# own order is left untouched: canonicalization treats every array as ordered
# content by default, so a reorder still counts as a value change here.
# (Test-IsAdditiveManifestDiff below treats sharedPaths and arrivesAsStructure
# as order-free sets for its own narrower comparison; that is a property of
# that one check, not of canonical-JSON equality in general. excludedPaths
# gets its own ordered comparison there instead; see DESIGN.md, "The
# additive-manifest exception (issue #53)".) The one recursive step
# Get-CanonicalJson needs so two manifests that differ only in JSON key order
# never read as a diff.
function ConvertTo-CanonicalValue {
  param($Value)
  if ($null -eq $Value) {
    return $null
  }
  if ($Value -is [System.Management.Automation.PSCustomObject]) {
    $sorted = [ordered]@{}
    foreach ($name in ($Value.PSObject.Properties.Name | Sort-Object)) {
      $sorted[$name] = ConvertTo-CanonicalValue -Value $Value.PSObject.Properties[$name].Value
    }
    return [PSCustomObject]$sorted
  }
  if (($Value -is [System.Collections.IEnumerable]) -and -not ($Value -is [string])) {
    $list = New-Object System.Collections.Generic.List[object]
    foreach ($item in $Value) {
      $list.Add((ConvertTo-CanonicalValue -Value $item))
    }
    # .ToArray(), never @($list): wrapping a List[object] directly with the
    # array-subexpression operator throws ArgumentException on some Windows
    # PowerShell 5.1 builds (reproduced on this repo's own dev machine); a
    # piped array (List[string], or any list run through Select-Object/
    # Where-Object first) is unaffected, so this is the one direct-wrap site.
    return $list.ToArray()
  }
  return $Value
}

# Get-CanonicalJson -- compact JSON of $Value with recursively sorted object
# keys. Two calls producing equal strings means equal content; unequal means a
# real difference, never a key-order artifact.
function Get-CanonicalJson {
  param($Value)
  $canon = ConvertTo-CanonicalValue -Value $Value
  return (ConvertTo-Json -InputObject $canon -Depth 12 -Compress)
}

# Get-ManifestDiffFields -- the top-level field names where $ParentManifest
# and $ChildManifest disagree (by canonical JSON of that field's value alone),
# sorted alphabetically for a deterministic printed line. A field present on
# only one side counts as differing (the missing side reads as $null).
function Get-ManifestDiffFields {
  param(
    [Parameter(Mandatory = $true)] $ParentManifest,
    [Parameter(Mandatory = $true)] $ChildManifest
  )
  $names = New-Object System.Collections.Generic.List[string]
  $seen = @{}
  foreach ($m in @($ParentManifest, $ChildManifest)) {
    foreach ($n in $m.PSObject.Properties.Name) {
      if (-not $seen.ContainsKey($n)) {
        $seen[$n] = $true
        $names.Add($n)
      }
    }
  }
  $diffs = New-Object System.Collections.Generic.List[string]
  foreach ($n in ($names | Sort-Object)) {
    $pProp = $ParentManifest.PSObject.Properties[$n]
    $cProp = $ChildManifest.PSObject.Properties[$n]
    $pVal = $null
    if ($null -ne $pProp) { $pVal = $pProp.Value }
    $cVal = $null
    if ($null -ne $cProp) { $cVal = $cProp.Value }
    if (-not [string]::Equals((Get-CanonicalJson -Value $pVal), (Get-CanonicalJson -Value $cVal), [System.StringComparison]::Ordinal)) {
      $diffs.Add($n)
    }
  }
  return @($diffs)
}

# Get-ManifestArrayFieldOrEmpty -- $Manifest.$Name as an array, or an empty
# array when the property is absent or explicitly null. Shared by
# Test-IsAdditiveManifestDiff's sharedPaths/excludedPaths/arrivesAsStructure
# checks so a manifest that omits one of those fields reads as "declares
# none" rather than throwing.
function Get-ManifestArrayFieldOrEmpty {
  param(
    [Parameter(Mandatory = $true)] $Manifest,
    [Parameter(Mandatory = $true)] [string]$Name
  )
  $prop = $Manifest.PSObject.Properties[$Name]
  # The leading comma on both returns: a bare `return @()` unrolls an empty
  # array onto the pipeline as zero elements, which a caller's assignment
  # collapses back to $null (the same trap Get-UnacknowledgedDivergent above
  # documents). ,@(...) makes the array itself the single pipeline object, so
  # a zero-count result still reaches the caller as a real empty array.
  if ($null -eq $prop -or $null -eq $prop.Value) {
    return ,@()
  }
  return ,@($prop.Value)
}

# Get-ManifestObjectFieldOrEmpty -- $Manifest.$Name as a PSCustomObject, or an
# empty one when the property is absent or explicitly null. The `classes`
# counterpart to Get-ManifestArrayFieldOrEmpty above.
function Get-ManifestObjectFieldOrEmpty {
  param(
    [Parameter(Mandatory = $true)] $Manifest,
    [Parameter(Mandatory = $true)] [string]$Name
  )
  $prop = $Manifest.PSObject.Properties[$Name]
  if ($null -eq $prop -or $null -eq $prop.Value) {
    return [PSCustomObject]@{}
  }
  return $prop.Value
}

# Test-IsAdditiveManifestDiff -- issue #53's narrow exception to "any manifest
# difference forces structure" (rule: standards/governance-sync.md § "What a
# sync is"; rationale: the governance repo's DESIGN.md § "The
# additive-manifest exception (issue #53)"). An added `excludedPaths` entry
# counts as additive only when it is not a `!`-prefixed negation, since a
# negation un-excludes a path and so is a subtraction in effect.
# $ChildTrackedFiles must be the child's tracked file list (git ls-files
# form: repo-relative, forward-slashed); $null disables the exception
# outright, since a newly added sharedPaths or classes entry can then not be
# checked for a collision at all -- the safe side is to call the whole diff
# structure.
function Test-IsAdditiveManifestDiff {
  param(
    [Parameter(Mandatory = $true)] $ParentManifest,
    [Parameter(Mandatory = $true)] $ChildManifest,
    [string[]]$ChildTrackedFiles
  )
  $allowedFields = @('sharedPaths', 'excludedPaths', 'classes', 'arrivesAsStructure')
  $diffFields = Get-ManifestDiffFields -ParentManifest $ParentManifest -ChildManifest $ChildManifest
  foreach ($f in $diffFields) {
    if ($allowedFields -notcontains $f) {
      return [PSCustomObject]@{
        IsAdditive = $false
        Reason     = "field '$f' differs and is outside the additive exception's four fields (sharedPaths, excludedPaths, classes, arrivesAsStructure)"
      }
    }
  }

  if ($null -eq $ChildTrackedFiles) {
    return [PSCustomObject]@{
      IsAdditive = $false
      Reason     = 'no child tracked file list was supplied; a collision cannot be ruled out'
    }
  }

  $addedSharedPaths = @()
  $addedClassesKeys = @()

  foreach ($f in $diffFields) {
    if ($f -eq 'classes') {
      $parentClasses = Get-ManifestObjectFieldOrEmpty -Manifest $ParentManifest -Name 'classes'
      $childClasses = Get-ManifestObjectFieldOrEmpty -Manifest $ChildManifest -Name 'classes'
      # Piped through ForEach-Object, not `.Properties.Name` directly: see
      # DESIGN.md, "The additive-manifest exception (issue #53)", for why.
      $parentKeys = @($parentClasses.PSObject.Properties | ForEach-Object { $_.Name })
      $childKeys = @($childClasses.PSObject.Properties | ForEach-Object { $_.Name })
      $parentKeySet = New-Object 'System.Collections.Generic.HashSet[string]'
      foreach ($k in $parentKeys) { [void]$parentKeySet.Add($k) }
      $childKeySet = New-Object 'System.Collections.Generic.HashSet[string]'
      foreach ($k in $childKeys) { [void]$childKeySet.Add($k) }
      $removedKeys = @($childKeys | Where-Object { -not $parentKeySet.Contains($_) })
      if ($removedKeys.Count -gt 0) {
        return [PSCustomObject]@{ IsAdditive = $false; Reason = "classes key removed: $($removedKeys -join ', ')" }
      }
      foreach ($k in $childKeys) {
        $pv = Get-CanonicalJson -Value $parentClasses.PSObject.Properties[$k].Value
        $cv = Get-CanonicalJson -Value $childClasses.PSObject.Properties[$k].Value
        # Ordinal, matching the excludedPaths and HashSet[string] comparisons
        # below: one comparison semantics per kind of value in this function.
        if (-not [string]::Equals($pv, $cv, [System.StringComparison]::Ordinal)) {
          return [PSCustomObject]@{ IsAdditive = $false; Reason = "classes key '$k' changed value" }
        }
      }
      $addedClassesKeys = @($parentKeys | Where-Object { -not $childKeySet.Contains($_) })
    } elseif ($f -eq 'excludedPaths') {
      # excludedPaths is order-sensitive (isExcluded applies entries in
      # order, last match wins), so a membership-only test is not enough:
      # only a strict append after the child's existing entries is proven
      # safe here. See DESIGN.md, "The additive-manifest exception (issue
      # #53)", for the reordering and mid-array-insertion cases this guards.
      $parentArr = Get-ManifestArrayFieldOrEmpty -Manifest $ParentManifest -Name $f
      $childArr = Get-ManifestArrayFieldOrEmpty -Manifest $ChildManifest -Name $f
      if ($childArr.Count -gt $parentArr.Count) {
        # A shorter parent array is not always a plain removal; see
        # DESIGN.md, "The additive-manifest exception (issue #53)".
        return [PSCustomObject]@{
          IsAdditive = $false
          Reason     = "the parent's excludedPaths is shorter than the child's: an entry was removed, possibly along with a reorder or value change"
        }
      }
      for ($i = 0; $i -lt $childArr.Count; $i++) {
        # Ordinal, case-sensitive: matches the HashSet[string] comparisons
        # below, whose default comparer is also ordinal. PowerShell's `-ne`
        # is case-insensitive and would treat 'buildlog/**' and
        # 'Buildlog/**' as unchanged, letting a real case-sensitivity change
        # slip through as an append.
        if (-not [string]::Equals([string]$childArr[$i], [string]$parentArr[$i], [System.StringComparison]::Ordinal)) {
          return [PSCustomObject]@{
            IsAdditive = $false
            Reason     = 'excludedPaths reordered or changed mid-array: isExcluded reads entry order, so only a strict append after the child''s existing entries is safe'
          }
        }
      }
      $added = @()
      if ($parentArr.Count -gt $childArr.Count) {
        $added = @($parentArr[$childArr.Count..($parentArr.Count - 1)])
      }
      foreach ($a in $added) {
        if (([string]$a).StartsWith('!')) {
          return [PSCustomObject]@{
            IsAdditive = $false
            Reason     = "excludedPaths entry '$a' is a negation, a subtraction rather than an addition"
          }
        }
      }
    } else {
      # sharedPaths, arrivesAsStructure: membership only, since a pure
      # reorder is safe here (neither Resolve-SharedSet nor the
      # arrivesAsStructure check in Get-PlanPathClassification reads order).
      # excludedPaths gets its own branch above because isExcluded does
      # read order.
      $parentArr = Get-ManifestArrayFieldOrEmpty -Manifest $ParentManifest -Name $f
      $childArr = Get-ManifestArrayFieldOrEmpty -Manifest $ChildManifest -Name $f
      $parentSet = New-Object 'System.Collections.Generic.HashSet[string]'
      foreach ($p in $parentArr) { [void]$parentSet.Add($p) }
      $childSet = New-Object 'System.Collections.Generic.HashSet[string]'
      foreach ($p in $childArr) { [void]$childSet.Add($p) }
      $removed = @($childArr | Where-Object { -not $parentSet.Contains($_) })
      if ($removed.Count -gt 0) {
        return [PSCustomObject]@{ IsAdditive = $false; Reason = "entry removed from ${f}: $($removed -join ', ')" }
      }
      $added = @($parentArr | Where-Object { -not $childSet.Contains($_) })
      if ($f -eq 'sharedPaths') {
        $addedSharedPaths = $added
      }
      # arrivesAsStructure additions need no collision test: pushing a path
      # onto it only forces structure on that path's first delivery, the
      # safe direction.
    }
  }

  foreach ($entry in $addedSharedPaths) {
    foreach ($tracked in $ChildTrackedFiles) {
      if (Test-MatchesManifestEntry -Path $tracked -Entry $entry) {
        return [PSCustomObject]@{
          IsAdditive = $false
          Reason     = "sharedPaths entry '$entry' collides with tracked child file '$tracked'"
        }
      }
    }
  }
  foreach ($entry in $addedClassesKeys) {
    foreach ($tracked in $ChildTrackedFiles) {
      if (Test-MatchesManifestEntry -Path $tracked -Entry $entry) {
        return [PSCustomObject]@{
          IsAdditive = $false
          Reason     = "classes key '$entry' collides with tracked child file '$tracked'"
        }
      }
    }
  }

  return [PSCustomObject]@{ IsAdditive = $true; Reason = 'every manifest difference is a safe addition' }
}

# Get-ManifestClassMatch -- the manifest.classes entry that decides $Path: an
# exact key wins over a "prefix/**" key, and among "prefix/**" keys the
# longest prefix wins (the governance repo's DESIGN.md § "Governance sync"
# ("The classes lookup: precedence")). Matched is $null when nothing
# matches.
function Get-ManifestClassMatch {
  param(
    [Parameter(Mandatory = $true)] $Manifest,
    [Parameter(Mandatory = $true)] [string]$Path
  )
  $classesProp = $Manifest.PSObject.Properties['classes']
  $exactEntry = $null
  $globCandidates = New-Object System.Collections.Generic.List[object]
  if ($null -ne $classesProp -and $null -ne $classesProp.Value) {
    foreach ($entryProp in $classesProp.Value.PSObject.Properties) {
      $entry = $entryProp.Name
      if (Test-MatchesManifestEntry -Path $Path -Entry $entry) {
        $prefix = Get-ManifestEntryPrefix -Entry $entry
        if ($null -eq $prefix) {
          $exactEntry = $entry
        } else {
          $globCandidates.Add([PSCustomObject]@{ Entry = $entry; PrefixLength = $prefix.Length })
        }
      }
    }
  }
  if ($null -ne $exactEntry) {
    return [PSCustomObject]@{
      Matched = $exactEntry
      Value   = $classesProp.Value.PSObject.Properties[$exactEntry].Value
    }
  }
  if ($globCandidates.Count -gt 0) {
    $best = ($globCandidates | Sort-Object -Property PrefixLength -Descending)[0]
    return [PSCustomObject]@{
      Matched = $best.Entry
      Value   = $classesProp.Value.PSObject.Properties[$best.Entry].Value
    }
  }
  return [PSCustomObject]@{ Matched = $null; Value = $null }
}

# Test-IsContentLiteral -- true only when $Value is the exact string
# "content", case-sensitive. Guards every classes/classesDefault comparison:
# PowerShell's -ceq against a collection filters and returns matching
# elements rather than a boolean, so an off-schema JSON array value like
# ["content"] would otherwise read as truthy and ship as content.
function Test-IsContentLiteral {
  param($Value)
  return ($Value -is [string]) -and ($Value -ceq 'content')
}

# Get-PlanPathClassification -- classifies one plan path content or
# structure: the prune rule, the first-delivery (arrivesAsStructure) rule,
# and the classes-match rule are standards/ownership-map.md § "Change
# classes"; the final-default (classesDefault) rule is
# standards/governance-sync.md § "What a sync is".
function Get-PlanPathClassification {
  param(
    [Parameter(Mandatory = $true)] $Manifest,
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [bool]$IsPrune,
    [Parameter(Mandatory = $true)] [bool]$IsAdd
  )
  if ($IsPrune) {
    return [PSCustomObject]@{
      Class  = 'content'
      Reason = 'prune: a retirement the manifest already judged by hash, never reclassified'
    }
  }
  if ($IsAdd) {
    $arrivesProp = $Manifest.PSObject.Properties['arrivesAsStructure']
    $arrivesList = @()
    if ($null -ne $arrivesProp -and $null -ne $arrivesProp.Value) {
      $arrivesList = @($arrivesProp.Value)
    }
    if ($arrivesList -contains $Path) {
      return [PSCustomObject]@{
        Class  = 'structure'
        Reason = 'first delivery: arrivesAsStructure names this path and the child does not have it yet'
      }
    }
  }
  $match = Get-ManifestClassMatch -Manifest $Manifest -Path $Path
  if ($null -ne $match.Matched) {
    if (Test-IsContentLiteral -Value $match.Value) {
      return [PSCustomObject]@{
        Class  = 'content'
        Reason = "classes entry '$($match.Matched)' is content"
      }
    }
    return [PSCustomObject]@{
      Class  = 'structure'
      Reason = "classes entry '$($match.Matched)' is '$($match.Value)', not content"
    }
  }
  $classesDefaultProp = $Manifest.PSObject.Properties['classesDefault']
  if ($null -ne $classesDefaultProp) {
    $defaultValue = $classesDefaultProp.Value
    if (Test-IsContentLiteral -Value $defaultValue) {
      return [PSCustomObject]@{
        Class  = 'content'
        Reason = 'no classes entry matches; classesDefault is content'
      }
    }
    return [PSCustomObject]@{
      Class  = 'structure'
      Reason = "no classes entry matches; classesDefault is '$defaultValue', not content"
    }
  }
  return [PSCustomObject]@{
    Class  = 'structure'
    Reason = 'no classes entry matches and no classesDefault declared; an unclassified path defaults to structure'
  }
}

# Get-SyncClassification -- classifies every path in a Get-SyncPlan result as
# content or structure and returns the run-level verdict. Full rule set:
# standards/governance-sync.md § "What a sync is"; rationale is recorded in
# the governance repo's DESIGN.md § "Governance sync".
#
# A structure RunClass withholds every plan path regardless of its own
# per-file class, and the consistency rule does the same when a shipped Add
# or Update cites a withheld path.
#
# $ChildTrackedFiles feeds issue #53's additive-manifest exception
# (Test-IsAdditiveManifestDiff below; see the governance repo's DESIGN.md §
# "The additive-manifest exception (issue #53)" for what qualifies). Omitted
# (or $null), a manifest difference behaves exactly as before this issue.
function Get-SyncClassification {
  param(
    [Parameter(Mandatory = $true)] $ParentManifest,
    $ChildManifest,
    [Parameter(Mandatory = $true)] $Plan,
    [Parameter(Mandatory = $true)] [string]$ParentRoot,
    [string[]]$ChildTrackedFiles
  )
  $addSet = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($p in @($Plan.Adds)) { [void]$addSet.Add($p) }
  $pruneSet = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($p in @($Plan.Prunes)) { [void]$pruneSet.Add($p) }

  $orderedPaths = @(@($Plan.Adds) + @($Plan.Updates) + @($Plan.Prunes))

  $files = New-Object System.Collections.Generic.List[object]
  foreach ($p in $orderedPaths) {
    $decision = Get-PlanPathClassification -Manifest $ParentManifest -Path $p `
      -IsPrune $pruneSet.Contains($p) -IsAdd $addSet.Contains($p)
    $files.Add([PSCustomObject]@{ Path = $p; Class = $decision.Class; Reason = $decision.Reason })
  }

  $runIsStructure = $false
  $runReason = $null
  if ($null -ne $ChildManifest) {
    # Ordinal, matching every other manifest-value comparison in this file
    # (Get-ManifestDiffFields, the classes-key and excludedPaths checks
    # below): PowerShell's `-ne` is case-insensitive, so a case-only
    # difference between the two manifests read as no difference at all,
    # skipped the diff branch below, and let the run classify content on a
    # manifest that in fact differed (standards/governance-sync.md: "every
    # other field ... stays structural on any difference, addition
    # included").
    if (-not [string]::Equals((Get-CanonicalJson -Value $ParentManifest), (Get-CanonicalJson -Value $ChildManifest), [System.StringComparison]::Ordinal)) {
      $additive = Test-IsAdditiveManifestDiff -ParentManifest $ParentManifest -ChildManifest $ChildManifest `
        -ChildTrackedFiles $ChildTrackedFiles
      if (-not $additive.IsAdditive) {
        $runIsStructure = $true
        $diffFields = Get-ManifestDiffFields -ParentManifest $ParentManifest -ChildManifest $ChildManifest
        $runReason = "manifest fields differ: $($diffFields -join ', ') ($($additive.Reason))"
      }
      # IsAdditive true: $runIsStructure stays false and the run classifies
      # on its remaining paths exactly as it would have if the manifests had
      # matched.
    }
  }

  $consistencyBroken = $false

  if ($runIsStructure) {
    $withheld = @($files | ForEach-Object { $_.Path })
    $shipped = @()
  } else {
    $withheld = @($files | Where-Object { $_.Class -eq 'structure' } | ForEach-Object { $_.Path })
    $shipped = @($files | Where-Object { $_.Class -eq 'content' } | ForEach-Object { $_.Path })

    if ($withheld.Count -gt 0) {
      $addUpdateSet = New-Object 'System.Collections.Generic.HashSet[string]'
      foreach ($p in @($Plan.Adds)) { [void]$addUpdateSet.Add($p) }
      foreach ($p in @($Plan.Updates)) { [void]$addUpdateSet.Add($p) }
      $citingPath = $null
      $citedPath = $null
      foreach ($shipPath in $shipped) {
        if (-not $addUpdateSet.Contains($shipPath)) { continue }
        $fullPath = Join-Path $ParentRoot ($shipPath -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { continue }
        $text = Get-Content -LiteralPath $fullPath -Raw
        if ($null -eq $text) { continue }
        foreach ($w in $withheld) {
          if ($text.Contains($w)) {
            $citingPath = $shipPath
            $citedPath = $w
            break
          }
        }
        if ($null -ne $citingPath) { break }
      }
      if ($null -ne $citingPath) {
        $consistencyBroken = $true
        $withheld = @($files | ForEach-Object { $_.Path })
        $shipped = @()
        $runReason = "shipped file $citingPath cites withheld path $citedPath"
      }
    }

    if (-not $consistencyBroken) {
      if ($files.Count -eq 0) {
        $runReason = 'the plan is empty; nothing to classify'
      } elseif ($shipped.Count -eq 0) {
        $runReason = 'every planned file was withheld'
      } elseif ($withheld.Count -eq 0) {
        $runReason = 'all planned files ship'
      } else {
        $runReason = "withheld $($withheld.Count) of $($files.Count) planned files: $($withheld -join ', ')"
      }
    }
  }

  $runClass = 'content'
  if ($runIsStructure) { $runClass = 'structure' }

  return [PSCustomObject]@{
    # .ToArray(), not @($files): see ConvertTo-CanonicalValue's comment on the
    # same array-subexpression-vs-List[object] issue. RunIsStructure and
    # ConsistencyBroken stay local ($runIsStructure, $consistencyBroken
    # above): no caller reads them once RunClass and OpensPr exist to answer
    # what they were for.
    Files     = $files.ToArray()
    RunClass  = $runClass
    RunReason = $runReason
    Withheld  = @($withheld)
    Shipped   = @($shipped)
    # The wrapper's one ship/no-ship test: true exactly when $shipped is
    # non-empty, which every no-PR case above (including an empty plan) sets
    # to empty first.
    OpensPr   = ($shipped.Count -gt 0)
  }
}
