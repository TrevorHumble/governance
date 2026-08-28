# tools/governance-sync.ps1: pulls this repo's declared shared governance into
# a child repo as a small pull request that merges itself on green CI, no
# reviewer, once the child's declared CI guard is confirmed required on its
# default branch. The only file in this pair with side effects (clone,
# fetch, worktree, commit, push, gh); the planning logic itself is pure and
# lives in tools/governance-sync-core.ps1.
#
# Exit-code contract, the same-tree invariant, and the one-profile-parsed-once
# rule this wrapper implements: the governance repo's DESIGN.md § "Governance
# sync". Merge-on-green mechanics, the CI-guard gate, the superseded-PR
# sweep, and the retained-divergent issue: standards/governance-sync.md.
#
# Windows PowerShell 5.1-compatible: no ternary, no ??, no &&, no ||. Native
# command output is redirected on stdout only, never merged via 2>&1 (that
# wraps each stderr line in a NativeCommandError in Windows PowerShell 5.1
# and can flip $? on a real success): $LASTEXITCODE stays the single source
# of truth for a native command's outcome.
param(
  [string]$ChildRoot = (Join-Path $PSScriptRoot '..'),
  [string]$ProfilePath,
  [switch]$DryRun,
  # Suppresses the auto-merge arming call only (issue #15 AC3): the superseded-PR sweep,
  # the PR/issue bodies, and every other step of a real run stay unchanged.
  [switch]$NoAutoMerge
)

. (Join-Path $PSScriptRoot 'governance-sync-core.ps1')
. (Join-Path $PSScriptRoot 'repo-profile-core.ps1')

# The two standing issues: standards/governance-sync.md § "The standing-issue
# rule". One open issue per title per child; the constant titles let
# Find-IssueByTitle match exactly, never via gh's own partial-match --search.
$StructureIssueTitle = 'governance sync: structure change pending adoption'
$DivergentIssueTitle = 'governance sync: retained divergent paths pending disposition'

# The one wording both the divergent-paths issue body and the sync PR body
# use for how to dispose of a retained-divergent path (issue #15 AC7). A single
# constant so the two sentences cannot drift apart.
$DivergentDisposalInstruction = 'dispose of by hand: delete the file, or declare the path under acknowledgedDivergentPaths in this repo''s own repo-profile.json'

# The one wording both superseded-sweep report sites (the nothing-to-sync exit and the
# shipped-PR exit) use for the sweep's outcome. A single pair of constants so the two
# copies cannot drift.
$SweepClosedMessageFormat = 'closed {0} superseded sync PR(s)'
$SweepFailureWarning = 'governance-sync: warning: could not close every superseded sync PR'

# Find-IssueByTitle -- the open issue in the CURRENT working directory's repo
# (gh resolves its target repo from cwd; callers push $ChildRoot first) whose
# title exactly equals $Title, or $null. --search is never used: its index is
# partial-match and lags issue creation, which would let a freshly-created
# issue go unfound and accumulate a duplicate on every run. The 1000 cap is a
# recorded limitation: a child holding more than 1000 open issues can miss
# the match and open a duplicate.
function Find-IssueByTitle {
  param(
    [Parameter(Mandatory = $true)] [string]$Gh,
    [Parameter(Mandatory = $true)] [string]$Title
  )
  $listOut = & $Gh issue list --state open --limit 1000 --json number,title,url
  if ($LASTEXITCODE -ne 0) {
    throw "governance-sync: gh issue list failed (exit $LASTEXITCODE)"
  }
  $parsed = ($listOut -join "`n") | ConvertFrom-Json
  if ($null -eq $parsed) {
    return $null
  }
  foreach ($i in @($parsed)) {
    if ($i.title -eq $Title) {
      return $i
    }
  }
  return $null
}

# Set-IssueByTitle -- creates the issue titled $Title, or refreshes its body
# in place when one is already open, so a run that keeps finding the same
# condition never accumulates one issue per parent commit. The one home for
# the exact-title-match-plus-refresh-in-place shape both standing issues use.
function Set-IssueByTitle {
  param(
    [Parameter(Mandatory = $true)] [string]$Gh,
    [Parameter(Mandatory = $true)] [string]$Title,
    [Parameter(Mandatory = $true)] [string]$Body
  )
  $existing = Find-IssueByTitle -Gh $Gh -Title $Title
  $bodyPath = Join-Path ([System.IO.Path]::GetTempPath()) ('governance-issue-' + [guid]::NewGuid().ToString('N') + '.md')
  Set-Content -LiteralPath $bodyPath -Value $Body -NoNewline
  try {
    if ($null -ne $existing) {
      & $Gh issue edit $existing.number --body-file $bodyPath | Out-Null
      if ($LASTEXITCODE -ne 0) {
        throw "governance-sync: gh issue edit failed for issue $($existing.number) (exit $LASTEXITCODE)"
      }
      return $existing.url
    }
    $createOut = & $Gh issue create --title $Title --body-file $bodyPath
    if ($LASTEXITCODE -ne 0) {
      throw "governance-sync: gh issue create failed (exit $LASTEXITCODE)"
    }
    $url = @($createOut) | Where-Object { $_ -match '^https?://' } | Select-Object -Last 1
    if (-not $url) {
      $refetched = Find-IssueByTitle -Gh $Gh -Title $Title
      if ($null -ne $refetched) { $url = $refetched.url }
    }
    if (-not $url) {
      throw 'governance-sync: gh issue create exited 0 but no issue URL could be captured from its output or recovered via gh issue list'
    }
    return $url
  } finally {
    if (Test-Path -LiteralPath $bodyPath) {
      Remove-Item -LiteralPath $bodyPath -Force -ErrorAction SilentlyContinue
    }
  }
}

# Close-IssueByTitle -- closes the open issue titled $Title, if any. Shared by
# both standing issues so a run that finds nothing pending, of either kind,
# does not keep a false open row.
function Close-IssueByTitle {
  param(
    [Parameter(Mandatory = $true)] [string]$Gh,
    [Parameter(Mandatory = $true)] [string]$Title,
    [Parameter(Mandatory = $true)] [string]$Reason
  )
  $existing = Find-IssueByTitle -Gh $Gh -Title $Title
  if ($null -ne $existing) {
    & $Gh issue close $existing.number --comment $Reason | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "governance-sync: gh issue close failed for issue $($existing.number) (exit $LASTEXITCODE)"
    }
  }
}

# Set-StandingStructureIssue / Close-StandingStructureIssue -- the structure
# issue's own body shape (standards/governance-sync.md § "The standing-issue
# rule") on top of the generic pair above.
function Set-StandingStructureIssue {
  param(
    [Parameter(Mandatory = $true)] [string]$Gh,
    [Parameter(Mandatory = $true)] [string]$ParentSha,
    [Parameter(Mandatory = $true)] [string]$RunReason,
    [string[]]$WithheldPaths
  )
  $bodyLines = New-Object System.Collections.Generic.List[string]
  $bodyLines.Add("Governance sync from parent sha $ParentSha.")
  $bodyLines.Add('')
  $bodyLines.Add("Reason: $RunReason")
  $bodyLines.Add('')
  $bodyLines.Add('Withheld paths:')
  foreach ($p in @($WithheldPaths)) { $bodyLines.Add("- $p") }
  return Set-IssueByTitle -Gh $Gh -Title $StructureIssueTitle -Body ($bodyLines -join "`n")
}

function Close-StandingStructureIssue {
  param(
    [Parameter(Mandatory = $true)] [string]$Gh,
    [Parameter(Mandatory = $true)] [string]$Reason
  )
  Close-IssueByTitle -Gh $Gh -Title $StructureIssueTitle -Reason $Reason
}

# Set-DivergentPathsIssue / Close-DivergentPathsIssue -- the retained-divergent
# issue (issue #15 AC6, AC7): filed only for a retained-divergent path the child has not
# acknowledged under its own repo-profile.json's acknowledgedDivergentPaths.
function Set-DivergentPathsIssue {
  param(
    [Parameter(Mandatory = $true)] [string]$Gh,
    [Parameter(Mandatory = $true)] [string]$ParentSha,
    [Parameter(Mandatory = $true)] [string[]]$Paths
  )
  $bodyLines = New-Object System.Collections.Generic.List[string]
  $bodyLines.Add("Governance sync from parent sha $ParentSha.")
  $bodyLines.Add('')
  $bodyLines.Add("Retained divergent paths, unacknowledged ($DivergentDisposalInstruction):")
  foreach ($p in @($Paths)) { $bodyLines.Add("- $p") }
  return Set-IssueByTitle -Gh $Gh -Title $DivergentIssueTitle -Body ($bodyLines -join "`n")
}

function Close-DivergentPathsIssue {
  param(
    [Parameter(Mandatory = $true)] [string]$Gh,
    [Parameter(Mandatory = $true)] [string]$Reason
  )
  Close-IssueByTitle -Gh $Gh -Title $DivergentIssueTitle -Reason $Reason
}

# Sync-DivergentPathsIssue -- the one place that decides "file the divergent-
# paths issue or close it": files it when $UnacknowledgedPaths (already filtered
# through Get-UnacknowledgedDivergent by the caller) is non-empty, closes it
# otherwise. Best-effort (issue #15 AC6): a gh failure here is a warning, never a
# failure of the run, at every one of the three real exits that call this.
# The one owner of that decision, so the three exits' logic and warning text
# cannot drift.
function Sync-DivergentPathsIssue {
  param(
    [Parameter(Mandatory = $true)] [string]$Gh,
    [Parameter(Mandatory = $true)] [string]$ParentSha,
    [string[]]$UnacknowledgedPaths
  )
  try {
    # An empty pipeline result collapses to $null, and @($null) is a one-element
    # array holding $null, not an empty one, so $null must be special-cased
    # before the @() wrap and count check or a fully-acknowledged run would
    # misread as one unacknowledged path and call Set-DivergentPathsIssue with
    # a $null -Paths, whose Mandatory binding throws.
    $realPaths = @()
    if ($null -ne $UnacknowledgedPaths) {
      $realPaths = @($UnacknowledgedPaths | Where-Object { $null -ne $_ })
    }
    if ($realPaths.Count -gt 0) {
      Set-DivergentPathsIssue -Gh $Gh -ParentSha $ParentSha -Paths $realPaths | Out-Null
    } else {
      Close-DivergentPathsIssue -Gh $Gh -Reason 'Governance sync found no unacknowledged retained-divergent paths; closing.'
    }
  } catch {
    [Console]::Error.WriteLine("governance-sync: warning: could not file or close the retained-divergent paths issue ($($_.Exception.Message))")
  }
}

# Get-CiGateStatus -- issue #15 AC4: Armed is true only when every check name the child
# declares in ciCheckNames is present among the checks GitHub actually
# requires on its default branch. An unreadable/absent protection object, an
# empty required-check list, and an empty declared ciCheckNames each count as
# absent, so none of the three ever arms. Named Get-, not Test-: this returns
# a status object (Armed, Reason), not a boolean, unlike every other Test-*
# in this codebase; an idiomatic `if (-not (Test-...))` caller would read the
# object as always-truthy and the guard would silently never fire.
function Get-CiGateStatus {
  param(
    [Parameter(Mandatory = $true)] [string]$Gh,
    [Parameter(Mandatory = $true)] [string]$DefaultBranch,
    [string[]]$CiCheckNames
  )
  $declared = @($CiCheckNames)
  if ($declared.Count -eq 0) {
    return [PSCustomObject]@{ Armed = $false; Reason = 'ciCheckNames is empty in repo-profile.json; nothing declared to require' }
  }
  # This reads required_status_checks.checks; the $readBack read in
  # tools/apply-branch-protection.ps1 is this read site's twin, reading that
  # same field back with the identical .required_status_checks.checks path,
  # and the --input PUT above it is what writes the field. No shared home
  # exists for the two reads (recorded gap, the governance repo's DESIGN.md §
  # "Merge-on-green sync (issue #15)"): a GitHub field rename must fix both
  # call sites by hand.
  $checksOut = & $Gh api "repos/{owner}/{repo}/branches/$DefaultBranch/protection" --jq '.required_status_checks.checks | map(.context)' 2>$null
  if ($LASTEXITCODE -ne 0) {
    return [PSCustomObject]@{ Armed = $false; Reason = "could not read required status checks on $DefaultBranch (branch protection unreadable or absent)" }
  }
  $joined = ($checksOut -join "`n").Trim()
  $required = @()
  if ($joined) {
    $parsedChecks = $joined | ConvertFrom-Json
    if ($null -ne $parsedChecks) { $required = @($parsedChecks) }
  }
  if ($required.Count -eq 0) {
    return [PSCustomObject]@{ Armed = $false; Reason = "$DefaultBranch has no required status checks" }
  }
  $requiredSet = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($c in $required) { [void]$requiredSet.Add($c) }
  $missing = @($declared | Where-Object { -not $requiredSet.Contains($_) })
  if ($missing.Count -gt 0) {
    return [PSCustomObject]@{ Armed = $false; Reason = "declared ciCheckNames not required on ${DefaultBranch}: $($missing -join ', ')" }
  }
  return [PSCustomObject]@{ Armed = $true; Reason = $null }
}

# Invoke-SupersededSyncSweep -- issue #15 AC5: closes (unmerged) and deletes every open
# PR whose head branch Test-IsSyncBranch matches and that is not $KeepBranch
# (this run's own branch, or $null/empty when this run built no branch at
# all, e.g. the empty-plan exit), so no older whole-file snapshot can merge
# over a newer one. Never throws: a close failure is reported back to the
# caller, which must not arm this run's PR when the sweep did not fully
# succeed.
function Invoke-SupersededSyncSweep {
  param(
    [Parameter(Mandatory = $true)] [string]$Gh,
    [string]$KeepBranch
  )
  # The 1000 cap mirrors Find-IssueByTitle's own recorded limitation above: a
  # child holding more than 1000 open PRs can miss an older sync PR here and
  # leave it unswept.
  $listOut = & $Gh pr list --state open --limit 1000 --json number,headRefName
  if ($LASTEXITCODE -ne 0) {
    return [PSCustomObject]@{ Success = $false; ClosedCount = 0 }
  }
  $parsed = ($listOut -join "`n") | ConvertFrom-Json
  $prs = @()
  if ($null -ne $parsed) { $prs = @($parsed) }
  $toClose = @($prs | Where-Object { (Test-IsSyncBranch -Branch $_.headRefName) -and ($_.headRefName -ne $KeepBranch) })
  $closedCount = 0
  foreach ($pr in $toClose) {
    & $Gh pr close $pr.number --delete-branch | Out-Null
    if ($LASTEXITCODE -ne 0) {
      return [PSCustomObject]@{ Success = $false; ClosedCount = $closedCount }
    }
    $closedCount++
  }
  return [PSCustomObject]@{ Success = $true; ClosedCount = $closedCount }
}

# Get-ChildTrackedFiles -- $ChildTreeRoot's tracked files (git ls-files),
# repo-relative and forward-slashed already (git's own form), NUL-split so a
# path holding a newline, a carriage return, or a trailing space survives
# intact. Feeds issue #53's additive-manifest exception
# (Test-IsAdditiveManifestDiff in tools/governance-sync-core.ps1): $null on
# any git failure, so that exception fails closed to structure rather than
# risk a collision check against an incomplete list.
function Get-ChildTrackedFiles {
  param(
    [Parameter(Mandatory = $true)] [string]$ChildTreeRoot
  )
  $outFile = [IO.Path]::GetTempFileName()
  $errFile = [IO.Path]::GetTempFileName()
  try {
    # Start-Process + -RedirectStandardOutput to a file, not PowerShell's own
    # native capture or `>`: both re-split stdout on line boundaries and
    # rewrite a bare `\r` to `\n`, losing a CR-bearing tracked path (legal on
    # POSIX). Redirecting at the OS handle level and reading raw bytes back
    # keeps every byte, CR included, intact.
    #
    # No `-C`: `-ArgumentList` joins its elements with a plain space and
    # applies no quoting, so a tree root containing a space (for example
    # "Code Projects") would reach git split into two arguments and fail.
    # `-WorkingDirectory` takes the path whole, no quoting needed.
    #
    # `-RedirectStandardError` points at a real temp file, not the `NUL`
    # device name: `NUL` only resolves to the null device on Windows, and
    # under pwsh on a POSIX CI runner it creates an ordinary file named
    # `NUL` in the working directory that nothing removes.
    $proc = Start-Process -FilePath 'git' -ArgumentList @('ls-files', '-z') `
      -WorkingDirectory $ChildTreeRoot `
      -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    if ($proc.ExitCode -ne 0) {
      return $null
    }
    $z = [System.Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($outFile))
    # `git ls-files -z` NUL-terminates each record, it does not NUL-separate
    # them: the output always ends with a trailing NUL, so whatever comes
    # after the last NUL is never a path. On Linux, Start-Process's
    # -RedirectStandardOutput appends a trailing newline to a non-empty
    # redirect file, so a naive split-and-filter-falsy picks up a phantom
    # final entry holding that newline (a string with a newline is truthy).
    # Cutting at the last NUL uses git's own terminator instead of guessing
    # from whitespace, so a legitimate trailing space, embedded CR, or LF
    # inside a real path is never touched.
    $lastNul = $z.LastIndexOf([char]0)
    if ($lastNul -lt 0) {
      # The leading comma: see Get-UnacknowledgedDivergent's comment in
      # tools/governance-sync-core.ps1 for why a bare `return @(...)` would
      # unroll a zero-file result back to $null at the caller.
      return ,@()
    }
    return ,@($z.Substring(0, $lastNul) -split "`0")
  } catch {
    return $null
  } finally {
    Remove-Item -LiteralPath $outFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
  }
}

# Get-Classification -- reads the child manifest from $ChildTreeRoot and
# returns Get-SyncClassification's result. Read half of the classify/print
# pair; Write-ClassificationLines below is the print half, kept separate so
# printing never has to fight a caller assigning this one's return value.
function Get-Classification {
  param(
    [Parameter(Mandatory = $true)] $ParentManifest,
    [Parameter(Mandatory = $true)] [string]$ChildTreeRoot,
    [Parameter(Mandatory = $true)] $Plan,
    [Parameter(Mandatory = $true)] [string]$ParentRoot
  )
  $childManifestPath = Join-Path $ChildTreeRoot 'governance-manifest.json'
  $childManifest = $null
  if (Test-Path -LiteralPath $childManifestPath -PathType Leaf) {
    try {
      $childManifest = (Get-Content -LiteralPath $childManifestPath -Raw) | ConvertFrom-Json
    } catch {
      throw "governance-sync: could not parse child manifest at $childManifestPath ($($_.Exception.Message))"
    }
  }
  # Same tree this call classifies against, so the additive exception's
  # collision test (issue #53) reads the same tree the run itself applies to,
  # the dry-run preview and the real run alike (each already calls this
  # function with its own tree; see the same-tree invariant, the governance repo's DESIGN.md §
  # "Governance sync").
  $childTrackedFiles = Get-ChildTrackedFiles -ChildTreeRoot $ChildTreeRoot
  return Get-SyncClassification -ParentManifest $ParentManifest -ChildManifest $childManifest -Plan $Plan `
    -ParentRoot $ParentRoot -ChildTrackedFiles $childTrackedFiles
}

# Write-ClassificationLines -- prints the issue #14 AC5 contract for $Classification:
# one `classify <class>: <path> (<reason>)` line per plan path, then one
# `classify RUN <content|structure>: <reason>` line (`.claude/commands/build.md`
# step 0b branches on that marker). The one call both the dry-run and
# real-run branches make, so the printed contract can never drift between
# the two.
function Write-ClassificationLines {
  param([Parameter(Mandatory = $true)] $Classification)
  foreach ($f in $Classification.Files) { Write-Output "classify $($f.Class): $($f.Path) ($($f.Reason))" }
  Write-Output "classify RUN $($Classification.RunClass): $($Classification.RunReason)"
}

# -ProfilePath's default is derived from -ChildRoot, never independently, so
# pointing this tool at a child always reads that child's own profile.
if (-not $ProfilePath) {
  $ProfilePath = Join-Path $ChildRoot 'repo-profile.json'
}

# Step a: probe the profile ourselves, ahead of any Get-RepoProfileValue call,
# whose default-on-error contract would otherwise read a corrupt or missing
# profile as healthy and report success forever.
if (-not (Test-Path -LiteralPath $ProfilePath -PathType Leaf)) {
  [Console]::Error.WriteLine("governance-sync: profile not found at $ProfilePath")
  exit 1
}
try {
  $profileObj = (Get-Content -LiteralPath $ProfilePath -Raw) | ConvertFrom-Json
} catch {
  [Console]::Error.WriteLine("governance-sync: could not parse profile at $ProfilePath ($($_.Exception.Message))")
  exit 1
}

# Step b: governanceHome, read directly off the one parsed object. Property
# PRESENCE matters here, not just its value: a field that fell out of a
# child's profile must read as unconfigured, never silently as "self."
$governanceHomeProp = $profileObj.PSObject.Properties['governanceHome']
if ($null -eq $governanceHomeProp) {
  Write-Output 'governanceHome not declared in repo-profile.json; nothing to sync'
  exit 0
}
$governanceHome = $governanceHomeProp.Value
if ($governanceHome -eq 'self') {
  Write-Output 'governance home: this repo is the governance home; nothing to sync'
  exit 0
}

# Step c: syncIssue, resolved before any clone or network access.
$syncIssueProp = $profileObj.PSObject.Properties['syncIssue']
$syncIssueValid = $false
$syncIssue = 0
if ($null -ne $syncIssueProp) {
  $rawValue = $syncIssueProp.Value
  if ($rawValue -is [int] -or $rawValue -is [long] -or $rawValue -is [double] -or $rawValue -is [decimal]) {
    $asDouble = [double]$rawValue
    if ($asDouble -gt 0 -and $asDouble -eq [Math]::Floor($asDouble)) {
      $syncIssueValid = $true
      $syncIssue = [int]$asDouble
    }
  }
}
if (-not $syncIssueValid) {
  [Console]::Error.WriteLine('governance-sync: syncIssue is absent or not a positive integer in repo-profile.json; required whenever governanceHome is not "self"')
  exit 1
}

# defaultBranch and ghPath ride the shared reader against this same profile
# file, so their fallback stays single-homed in repo-profile-core.ps1's
# $FieldDefaults rather than a second copy here.
$defaultBranch = Get-RepoProfileValue -Field 'defaultBranch' -ProfilePath $ProfilePath
$profileGhPath = Get-RepoProfileValue -Field 'ghPath' -ProfilePath $ProfilePath

# ciCheckNames (the issue #15 AC4 gate) and acknowledgedDivergentPaths (issue #15 AC7) are read
# directly off the one already-parsed $profileObj, same as governanceHome and
# syncIssue above, per the one-profile-parsed-once rule.
$ciCheckNamesProp = $profileObj.PSObject.Properties['ciCheckNames']
$ciCheckNames = @()
if ($null -ne $ciCheckNamesProp -and $null -ne $ciCheckNamesProp.Value) {
  $ciCheckNames = @($ciCheckNamesProp.Value)
}
$acknowledgedDivergentProp = $profileObj.PSObject.Properties['acknowledgedDivergentPaths']
$acknowledgedDivergentPaths = @()
if ($null -ne $acknowledgedDivergentProp -and $null -ne $acknowledgedDivergentProp.Value) {
  $acknowledgedDivergentPaths = @($acknowledgedDivergentProp.Value)
}

$tempRoot = [System.IO.Path]::GetTempPath()
$tempCloneDir = Join-Path $tempRoot ('governance-sync-parent-' + [guid]::NewGuid().ToString('N'))
$syncWorktreeDir = $null
$prBodyPath = $null
$pushedLocation = $false

try {
  # Step d: clone the parent shallow.
  & git clone --quiet --depth 1 $governanceHome $tempCloneDir | Out-Null
  if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("governance-sync: git clone of governance home '$governanceHome' failed (exit $LASTEXITCODE)")
    exit 2
  }
  $parentSha = "$(& git -C $tempCloneDir rev-parse HEAD)".Trim()
  if ($LASTEXITCODE -ne 0 -or -not $parentSha) {
    [Console]::Error.WriteLine('governance-sync: could not read the parent clone HEAD sha')
    exit 2
  }
  $shortSha = $parentSha.Substring(0, 8)
  $parentManifestPath = Join-Path $tempCloneDir 'governance-manifest.json'
  if (-not (Test-Path -LiteralPath $parentManifestPath -PathType Leaf)) {
    [Console]::Error.WriteLine("governance-sync: governance home '$governanceHome' has no governance-manifest.json")
    exit 2
  }
  $parentManifest = (Get-Content -LiteralPath $parentManifestPath -Raw) | ConvertFrom-Json

  # Step e: -DryRun.
  if ($DryRun) {
    # Preview of the invoking tree only: the real run's plan (below) is
    # computed against the branch being synced instead, per the same-tree
    # invariant, so this preview and a real run can legitimately disagree.
    $plan = Get-SyncPlan -ParentRoot $tempCloneDir -ChildRoot $ChildRoot -Manifest $parentManifest
    foreach ($w in $plan.Warnings) { Write-Output "WARNING $w" }
    foreach ($p in $plan.Adds) { Write-Output "add: $p" }
    foreach ($p in $plan.Updates) { Write-Output "update: $p" }
    foreach ($p in $plan.Prunes) { Write-Output "prune: $p" }
    $unacknowledgedDivergentDry = Get-UnacknowledgedDivergent -Plan $plan -Acknowledged $acknowledgedDivergentPaths
    foreach ($p in $unacknowledgedDivergentDry) { Write-Output "WARNING retained divergent: $p" }

    # Classify against the invoking tree (the dry-run preview's own tree, per
    # the same-tree invariant above). Preview only: opens no issue, touches no
    # branch.
    $classificationDry = Get-Classification -ParentManifest $parentManifest -ChildTreeRoot $ChildRoot -Plan $plan -ParentRoot $tempCloneDir
    Write-ClassificationLines -Classification $classificationDry
    exit 0
  }

  # Step f: real run. Fetch, clear stale worktree registrations a killed
  # prior run left, then create a DETACHED worktree at origin/<defaultBranch>
  # (no branch name involved yet, so no name collision is possible here).
  & git -C $ChildRoot fetch --quiet origin | Out-Null
  if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("governance-sync: git fetch origin failed in $ChildRoot (exit $LASTEXITCODE)")
    exit 2
  }
  & git -C $ChildRoot worktree prune | Out-Null
  if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("governance-sync: git worktree prune failed in $ChildRoot (exit $LASTEXITCODE)")
    exit 2
  }
  $syncWorktreeDir = Join-Path $tempRoot ('governance-sync-worktree-' + [guid]::NewGuid().ToString('N'))
  & git -C $ChildRoot worktree add --detach --quiet $syncWorktreeDir "origin/$defaultBranch" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("governance-sync: git worktree add --detach failed against origin/$defaultBranch (exit $LASTEXITCODE)")
    exit 2
  }

  # Step g: the plan is computed AGAINST THE DETACHED WORKTREE, never the
  # invoking checkout (the same-tree invariant): the invoking tree could hash
  # clean while the branch being synced holds diverged content, and a plan
  # computed against the wrong tree would silently revert that divergence.
  $plan = Get-SyncPlan -ParentRoot $tempCloneDir -ChildRoot $syncWorktreeDir -Manifest $parentManifest
  foreach ($w in $plan.Warnings) { Write-Output "WARNING $w" }
  $unacknowledgedDivergent = Get-UnacknowledgedDivergent -Plan $plan -Acknowledged $acknowledgedDivergentPaths
  foreach ($p in $unacknowledgedDivergent) { Write-Output "WARNING retained divergent: $p" }

  $isEmpty = ($plan.Adds.Count -eq 0) -and ($plan.Updates.Count -eq 0) -and ($plan.Prunes.Count -eq 0)
  if ($isEmpty) {
    # Best-effort only (standards/governance-sync.md § "The standing-issue
    # rule"): a human can adopt a structure change by hand, leaving a stale
    # open issue this cleans up, but "nothing to sync" must still print and
    # exit 0 even when gh cannot be resolved or reached. The divergence issue
    # (issue #15 AC6) and the superseded-PR sweep (issue #15 AC5) share the same best-effort
    # contract on this exit: a gh failure is a warning, never a failure of
    # the run.
    try {
      $gh = Resolve-GhPath -ProfileGhPath $profileGhPath
      if (-not $pushedLocation) {
        Push-Location $ChildRoot
        $pushedLocation = $true
      }
      Close-StandingStructureIssue -Gh $gh -Reason 'Governance sync found nothing pending; closing the standing structure issue.'
      Sync-DivergentPathsIssue -Gh $gh -ParentSha $parentSha -UnacknowledgedPaths $unacknowledgedDivergent
      $sweep = Invoke-SupersededSyncSweep -Gh $gh -KeepBranch $null
      if ($sweep.Success -and $sweep.ClosedCount -gt 0) {
        Write-Output ($SweepClosedMessageFormat -f $sweep.ClosedCount)
      }
      if (-not $sweep.Success) {
        [Console]::Error.WriteLine($SweepFailureWarning)
      }
    } catch {
      [Console]::Error.WriteLine("governance-sync: warning: could not update the standing structure or divergent-paths issue, or sweep superseded sync PRs ($($_.Exception.Message))")
    }
    Write-Output "in sync with $parentSha"
    exit 0
  }

  # Classify against the DETACHED WORKTREE (the same-tree invariant applies
  # to classification too), never the invoking checkout. Placed after the
  # isEmpty early exit: an empty plan has nothing to classify, and printing
  # above the exit would put a run-level line in front of the routine
  # "in sync with <sha>" message on every child build.
  $classification = Get-Classification -ParentManifest $parentManifest -ChildTreeRoot $syncWorktreeDir -Plan $plan -ParentRoot $tempCloneDir
  Write-ClassificationLines -Classification $classification

  # Step h: resolve gh before any mutation -- nothing exists yet to orphan if
  # this fails.
  $gh = Resolve-GhPath -ProfileGhPath $profileGhPath

  # gh resolves its target repo from the current directory, so push
  # $ChildRoot once, guarded, shared with step j's own gh calls below.
  if (-not $pushedLocation) {
    Push-Location $ChildRoot
    $pushedLocation = $true
  }

  $closeStandingIssueAfterShip = $false
  if (-not $classification.OpensPr) {
    $issueUrl = Set-StandingStructureIssue -Gh $gh -ParentSha $parentSha -RunReason $classification.RunReason -WithheldPaths $classification.Withheld
    Write-Output "structure change: no sync PR ($($classification.RunReason)); child issue: $issueUrl"
    # No superseded-PR sweep on this exit (issue #15 AC5): an older sync PR here still
    # carries content this child has not received, and closing it would
    # strand that content until a human adopts the withheld structure change.
    Sync-DivergentPathsIssue -Gh $gh -ParentSha $parentSha -UnacknowledgedPaths $unacknowledgedDivergent
    exit 0
  }
  if ($classification.Withheld.Count -gt 0) {
    $issueUrl = Set-StandingStructureIssue -Gh $gh -ParentSha $parentSha -RunReason $classification.RunReason -WithheldPaths $classification.Withheld
    Write-Output "structure change: partial withhold ($($classification.RunReason)); child issue: $issueUrl"
    # Ship from Shipped, the classifier's own answer, rather than re-filtering
    # against Withheld. $plan.Prunes needs no such filter: rule 0
    # (standards/ownership-map.md § "Change classes") classifies every Prune
    # content, so a Prune never appears in Withheld.
    $shippedSet = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($p in @($classification.Shipped)) { [void]$shippedSet.Add($p) }
    $plan.Adds = @($plan.Adds | Where-Object { $shippedSet.Contains($_) })
    $plan.Updates = @($plan.Updates | Where-Object { $shippedSet.Contains($_) })
  } else {
    $closeStandingIssueAfterShip = $true
  }

  $branchName = New-SyncBranchName -SyncIssue $syncIssue -ShortSha $shortSha

  & git -C $ChildRoot show-ref --verify --quiet "refs/heads/$branchName"
  $localBranchExists = ($LASTEXITCODE -eq 0)
  if ($localBranchExists) {
    # A stale local branch of this exact name (same shortsha) can only hold a
    # machine-generated sync commit, reproducible from the same inputs.
    & git -C $ChildRoot branch -D $branchName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      [Console]::Error.WriteLine("governance-sync: could not delete stale local branch $branchName (exit $LASTEXITCODE)")
      exit 2
    }
  }

  # Step i: build the branch at the detached worktree's HEAD, apply the
  # step-g plan IN THAT WORKTREE, commit, and force-push. The remote branch
  # is never trusted as current: it is always rebuilt from scratch and
  # force-pushed over whatever is there, since the child's tree may have
  # moved since any prior push.
  & git -C $syncWorktreeDir switch -c $branchName --quiet | Out-Null
  if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("governance-sync: could not create branch $branchName in the sync worktree (exit $LASTEXITCODE)")
    exit 2
  }

  foreach ($rel in (@($plan.Adds) + @($plan.Updates))) {
    $src = Join-Path $tempCloneDir ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
    $dst = Join-Path $syncWorktreeDir ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
    try {
      $dstDir = Split-Path -Parent $dst
      if ($dstDir -and -not (Test-Path -LiteralPath $dstDir)) {
        New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
      }
      Copy-Item -LiteralPath $src -Destination $dst -Force
    } catch {
      [Console]::Error.WriteLine("governance-sync: could not copy $rel into the sync worktree ($($_.Exception.Message))")
      exit 2
    }
  }
  foreach ($rel in @($plan.Prunes)) {
    $dst = Join-Path $syncWorktreeDir ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
    try {
      Remove-Item -LiteralPath $dst -Force
    } catch {
      [Console]::Error.WriteLine("governance-sync: could not delete retired path $rel from the sync worktree ($($_.Exception.Message))")
      exit 2
    }
  }

  # Staged explicitly against the plan's own Adds/Updates/Prunes lists, never
  # `add -A`: a blanket add honors the child's own .gitignore, so a child that
  # gitignores a shared path would silently never receive it while the run
  # still exits 0 and the PR body still lists it as delivered. -f overrides
  # that: the manifest, not a child's ignore file, decides what ships.
  #
  # The .githooks/ slice is staged separately, with --chmod=+x, and it is
  # built from the WHOLE .githooks/ set now present in the sync worktree,
  # not just this run's Adds/Updates: rationale, tradeoff, and its one
  # remaining limitation are in the governance repo's DESIGN.md §
  # "Governance sync" ("The .githooks/ executable-bit repair").
  $stageAddUpdate = @($plan.Adds) + @($plan.Updates)
  $otherAddUpdate = @($stageAddUpdate | Where-Object { -not (Test-MatchesManifestEntry -Path $_ -Entry '.githooks/**') })
  # Resolved once and reused as both the hook-directory base and the
  # repo-relative root: ConvertTo-RepoRelativeSlash slices by string length,
  # so an unresolved root (e.g. a short 8.3 TEMP path) paired with
  # Get-ChildItem's fully expanded FullName would slice at the wrong offset.
  $syncWorktreeFull = (Resolve-Path -LiteralPath $syncWorktreeDir).ProviderPath
  $hookDir = Join-Path $syncWorktreeFull '.githooks'
  $hookFilesAll = @()
  if (Test-Path -LiteralPath $hookDir -PathType Container) {
    $hookFilesAll = @(Get-ChildItem -LiteralPath $hookDir -Recurse -File -Force | ForEach-Object {
      ConvertTo-RepoRelativeSlash -FullPath $_.FullName -RootFull $syncWorktreeFull
    })
  }
  if ($hookFilesAll.Count -gt 0) {
    & git -C $syncWorktreeDir add -f --chmod=+x -- $hookFilesAll | Out-Null
    if ($LASTEXITCODE -ne 0) {
      [Console]::Error.WriteLine("governance-sync: git add -f --chmod=+x failed in the sync worktree (exit $LASTEXITCODE)")
      exit 2
    }
  }
  if ($otherAddUpdate.Count -gt 0) {
    & git -C $syncWorktreeDir add -f -- $otherAddUpdate | Out-Null
    if ($LASTEXITCODE -ne 0) {
      [Console]::Error.WriteLine("governance-sync: git add -f failed in the sync worktree (exit $LASTEXITCODE)")
      exit 2
    }
  }
  if (@($plan.Prunes).Count -gt 0) {
    & git -C $syncWorktreeDir rm -f -q -- @($plan.Prunes) | Out-Null
    if ($LASTEXITCODE -ne 0) {
      [Console]::Error.WriteLine("governance-sync: git rm -f failed in the sync worktree (exit $LASTEXITCODE)")
      exit 2
    }
  }
  & git -C $syncWorktreeDir commit --quiet -m "governance sync from $parentSha (#$syncIssue)" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("governance-sync: git commit failed in the sync worktree (exit $LASTEXITCODE)")
    exit 2
  }
  & git -C $syncWorktreeDir push --force-with-lease --quiet origin $branchName | Out-Null
  if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("governance-sync: git push --force-with-lease failed for $branchName (exit $LASTEXITCODE)")
    exit 2
  }

  # Step j: open or refresh the sync PR. gh resolves its target repo from the
  # current directory, so every gh call below runs with the child repo as the
  # working directory.
  $bodyLines = New-Object System.Collections.Generic.List[string]
  $bodyLines.Add("Governance sync from $governanceHome at $parentSha.")
  $bodyLines.Add('')
  $bodyLines.Add('Merges on green CI per `standards/governance-sync.md`: no reviewer.')
  $bodyLines.Add('')
  $bodyLines.Add('Add:')
  foreach ($p in $plan.Adds) { $bodyLines.Add("- $p") }
  $bodyLines.Add('')
  $bodyLines.Add('Update:')
  foreach ($p in $plan.Updates) { $bodyLines.Add("- $p") }
  $bodyLines.Add('')
  $bodyLines.Add('Prune:')
  foreach ($p in $plan.Prunes) { $bodyLines.Add("- $p") }
  $bodyLines.Add('')
  # Read from Get-UnacknowledgedDivergent's own filtered list, the one owner
  # both the warning loop and the divergent-paths issue also read (issue #15 AC7): an
  # acknowledged path must stop appearing here too, not just stop warning and
  # stop opening the issue.
  $bodyLines.Add("Retained divergent, unacknowledged ($DivergentDisposalInstruction):")
  foreach ($p in $unacknowledgedDivergent) { $bodyLines.Add("- $p") }
  if ($plan.Warnings.Count -gt 0) {
    $bodyLines.Add('')
    $bodyLines.Add('Warnings:')
    foreach ($w in $plan.Warnings) { $bodyLines.Add("- $w") }
  }
  $prBodyPath = Join-Path $tempRoot ('governance-sync-prbody-' + [guid]::NewGuid().ToString('N') + '.md')
  Set-Content -LiteralPath $prBodyPath -Value ($bodyLines -join "`n") -NoNewline

  if (-not $pushedLocation) {
    Push-Location $ChildRoot
    $pushedLocation = $true
  }
  $listOut = & $gh pr list --head $branchName --state open --json url
  if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("governance-sync: gh pr list failed (exit $LASTEXITCODE)")
    exit 2
  }
  # ConvertFrom-Json on '[]' returns $null, not an empty array: @($null) is a
  # one-element array holding $null, not an empty one, so $null must be
  # special-cased before the @() wrap or an empty PR list would misread as
  # one open PR with a blank URL.
  $parsedExisting = ($listOut -join "`n") | ConvertFrom-Json
  if ($null -eq $parsedExisting) {
    $existing = @()
  } else {
    $existing = @($parsedExisting)
  }

  if ($existing.Count -gt 0) {
    $prUrl = $existing[0].url
    & $gh pr edit $prUrl --body-file $prBodyPath | Out-Null
    if ($LASTEXITCODE -ne 0) {
      [Console]::Error.WriteLine("governance-sync: gh pr edit failed for $prUrl (exit $LASTEXITCODE)")
      exit 2
    }
    Write-Output "sync PR open: $prUrl"
  } else {
    $createOut = & $gh pr create --head $branchName --base $defaultBranch --title "governance sync from $shortSha (#$syncIssue)" --body-file $prBodyPath
    if ($LASTEXITCODE -ne 0) {
      [Console]::Error.WriteLine("governance-sync: gh pr create failed (exit $LASTEXITCODE)")
      exit 2
    }
    # gh normally prints the URL as its last stdout line, but a null-safe
    # "take the last non-empty line" read would misreport a URL-less success
    # as an operational failure by throwing on $null, and would trust a
    # non-URL last line blindly. Select the last line that actually looks
    # like a URL; if none does, the PR still exists (exit 0), so recover the
    # URL the same way an already-open PR is found rather than treating a
    # created PR as a failure.
    $prUrl = @($createOut) | Where-Object { $_ -match '^https?://' } | Select-Object -Last 1
    if (-not $prUrl) {
      $recoverOut = & $gh pr list --head $branchName --state open --json url
      if ($LASTEXITCODE -eq 0) {
        $recoverParsed = ($recoverOut -join "`n") | ConvertFrom-Json
        if ($null -ne $recoverParsed) {
          $recovered = @($recoverParsed)
          if ($recovered.Count -gt 0) {
            $prUrl = $recovered[0].url
          }
        }
      }
    }
    if (-not $prUrl) {
      [Console]::Error.WriteLine("governance-sync: gh pr create exited 0 but no PR URL could be captured from its output or recovered via gh pr list")
      exit 2
    }
    Write-Output "sync PR opened: $prUrl"
  }

  # Close deferred to here, after the PR is open and its URL printed, not
  # before the branch is built: closing earlier would leave the child with
  # neither an open PR nor a standing issue if the push or `gh pr create`
  # below it failed.
  if ($closeStandingIssueAfterShip) {
    Close-StandingStructureIssue -Gh $gh -Reason 'Governance sync shipped with nothing withheld; closing the standing structure issue.'
  }

  Sync-DivergentPathsIssue -Gh $gh -ParentSha $parentSha -UnacknowledgedPaths $unacknowledgedDivergent

  # Issue #15 AC5: sweep every other open sync PR before arming this one, so no older
  # whole-file snapshot can merge over this run's newer one. A sweep failure
  # skips arming entirely (warn, leave every sync PR open for hand-merge): a
  # surviving older armed PR is the one failure arming would make worse.
  $sweep = Invoke-SupersededSyncSweep -Gh $gh -KeepBranch $branchName
  if ($sweep.Success -and $sweep.ClosedCount -gt 0) {
    Write-Output ($SweepClosedMessageFormat -f $sweep.ClosedCount)
  }
  if (-not $sweep.Success) {
    [Console]::Error.WriteLine("$SweepFailureWarning; leaving every sync PR open for hand-merge")
  } elseif ($NoAutoMerge) {
    Write-Output 'auto-merge: -NoAutoMerge passed; leaving the PR open for hand-merge'
  } else {
    # Issue #15 AC1/AC2: the only merge command anywhere in this file. Wrapped so any
    # failure at any step here is a warning, never a non-zero exit (issue #15 AC2).
    try {
      $gate = Get-CiGateStatus -Gh $gh -DefaultBranch $defaultBranch -CiCheckNames $ciCheckNames
      if (-not $gate.Armed) {
        [Console]::Error.WriteLine("governance-sync: warning: auto-merge not armed ($($gate.Reason)); leaving the PR open for hand-merge")
      } else {
        & $gh pr merge --auto --merge $prUrl | Out-Null
        if ($LASTEXITCODE -ne 0) {
          [Console]::Error.WriteLine("governance-sync: warning: gh pr merge --auto failed for $prUrl (exit $LASTEXITCODE); leaving the PR open for hand-merge")
        } else {
          Write-Output "auto-merge armed: $prUrl"
        }
      }
    } catch {
      [Console]::Error.WriteLine("governance-sync: warning: could not arm auto-merge ($($_.Exception.Message)); leaving the PR open for hand-merge")
    }
  }

  exit 0
} catch {
  # Routes every unhandled exception, including Resolve-SharedSet's
  # corrupt-manifest throw, to the exit-2 path: a PowerShell `throw` sets no
  # $LASTEXITCODE, so it would otherwise fall through unnoticed.
  [Console]::Error.WriteLine("governance-sync: $($_.Exception.Message)")
  exit 2
} finally {
  if ($pushedLocation) {
    Pop-Location
  }
  # Removes the temp clone and any sync worktree on EVERY exit path, success
  # included: the pushed branch and the PR are the products that survive,
  # never a leaked temp directory or a registered worktree in the child.
  if ($syncWorktreeDir -and (Test-Path -LiteralPath $syncWorktreeDir)) {
    & git -C $ChildRoot worktree remove --force $syncWorktreeDir | Out-Null
    & git -C $ChildRoot worktree prune | Out-Null
  }
  if ($tempCloneDir -and (Test-Path -LiteralPath $tempCloneDir)) {
    Remove-Item -LiteralPath $tempCloneDir -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($prBodyPath -and (Test-Path -LiteralPath $prBodyPath)) {
    Remove-Item -LiteralPath $prBodyPath -Force -ErrorAction SilentlyContinue
  }
}
