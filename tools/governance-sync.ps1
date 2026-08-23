# tools/governance-sync.ps1: pulls this repo's declared shared governance into
# a child repo as a small, reviewed pull request. The only file in this pair
# with side effects (clone, fetch, worktree, commit, push, gh); the planning
# logic itself is pure and lives in tools/governance-sync-core.ps1.
#
# Exit-code contract, the same-tree invariant, and the one-profile-parsed-once
# rule this wrapper implements: the governance repo's DESIGN.md § "Governance
# sync". The contradiction review a child's reviewer runs on the PR this
# opens: standards/governance-sync.md.
#
# Windows PowerShell 5.1-compatible: no ternary, no ??, no &&, no ||. Native
# command output is redirected on stdout only, never merged via 2>&1 (that
# wraps each stderr line in a NativeCommandError in Windows PowerShell 5.1
# and can flip $? on a real success): $LASTEXITCODE stays the single source
# of truth for a native command's outcome.
param(
  [string]$ChildRoot = (Join-Path $PSScriptRoot '..'),
  [string]$ProfilePath,
  [switch]$DryRun
)

. (Join-Path $PSScriptRoot 'governance-sync-core.ps1')
. (Join-Path $PSScriptRoot 'repo-profile-core.ps1')

# The standing structure issue: standards/governance-sync.md § "The
# standing-issue rule". One open issue per child; the constant title lets
# Find-StandingStructureIssue match it exactly, never via gh's own
# partial-match --search.
$StructureIssueTitle = 'governance sync: structure change pending adoption'

# Find-StandingStructureIssue -- the open issue in the CURRENT working
# directory's repo (gh resolves its target repo from cwd; callers push
# $ChildRoot first) whose title exactly equals $StructureIssueTitle, or $null.
# --search is never used: its index is partial-match and lags issue creation,
# which would let a freshly-created issue go unfound and accumulate a
# duplicate on every run. The 1000 cap is a recorded limitation: a child
# holding more than 1000 open issues can miss the match and open a duplicate.
function Find-StandingStructureIssue {
  param([Parameter(Mandatory = $true)] [string]$Gh)
  $listOut = & $Gh issue list --state open --limit 1000 --json number,title,url
  if ($LASTEXITCODE -ne 0) {
    throw "governance-sync: gh issue list failed (exit $LASTEXITCODE)"
  }
  $parsed = ($listOut -join "`n") | ConvertFrom-Json
  if ($null -eq $parsed) {
    return $null
  }
  foreach ($i in @($parsed)) {
    if ($i.title -eq $StructureIssueTitle) {
      return $i
    }
  }
  return $null
}

# Set-StandingStructureIssue -- creates the standing structure issue, or
# refreshes it in place when one is already open, so a run that keeps finding
# the same structure change never accumulates one issue per parent commit.
# Body shape: standards/governance-sync.md § "The standing-issue rule".
function Set-StandingStructureIssue {
  param(
    [Parameter(Mandatory = $true)] [string]$Gh,
    [Parameter(Mandatory = $true)] [string]$ParentSha,
    [Parameter(Mandatory = $true)] [string]$RunReason,
    [string[]]$WithheldPaths
  )
  $existing = Find-StandingStructureIssue -Gh $Gh
  $bodyLines = New-Object System.Collections.Generic.List[string]
  $bodyLines.Add("Governance sync from parent sha $ParentSha.")
  $bodyLines.Add('')
  $bodyLines.Add("Reason: $RunReason")
  $bodyLines.Add('')
  $bodyLines.Add('Withheld paths:')
  foreach ($p in @($WithheldPaths)) { $bodyLines.Add("- $p") }
  $bodyPath = Join-Path ([System.IO.Path]::GetTempPath()) ('governance-structure-issue-' + [guid]::NewGuid().ToString('N') + '.md')
  Set-Content -LiteralPath $bodyPath -Value ($bodyLines -join "`n") -NoNewline
  try {
    if ($null -ne $existing) {
      & $Gh issue edit $existing.number --body-file $bodyPath | Out-Null
      if ($LASTEXITCODE -ne 0) {
        throw "governance-sync: gh issue edit failed for issue $($existing.number) (exit $LASTEXITCODE)"
      }
      return $existing.url
    }
    $createOut = & $Gh issue create --title $StructureIssueTitle --body-file $bodyPath
    if ($LASTEXITCODE -ne 0) {
      throw "governance-sync: gh issue create failed (exit $LASTEXITCODE)"
    }
    $url = @($createOut) | Where-Object { $_ -match '^https?://' } | Select-Object -Last 1
    if (-not $url) {
      $refetched = Find-StandingStructureIssue -Gh $Gh
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

# Close-StandingStructureIssue -- a run that ships a PR with nothing withheld,
# or an empty plan, closes any open standing structure issue instead, so a
# child that has adopted the change does not keep a false open row.
function Close-StandingStructureIssue {
  param(
    [Parameter(Mandatory = $true)] [string]$Gh,
    [Parameter(Mandatory = $true)] [string]$Reason
  )
  $existing = Find-StandingStructureIssue -Gh $Gh
  if ($null -ne $existing) {
    & $Gh issue close $existing.number --comment $Reason | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "governance-sync: gh issue close failed for issue $($existing.number) (exit $LASTEXITCODE)"
    }
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
  return Get-SyncClassification -ParentManifest $ParentManifest -ChildManifest $childManifest -Plan $Plan -ParentRoot $ParentRoot
}

# Write-ClassificationLines -- prints the AC5 contract for $Classification:
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
    foreach ($p in $plan.RetainedDivergent) { Write-Output "WARNING retained divergent: $p" }

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
  foreach ($p in $plan.RetainedDivergent) { Write-Output "WARNING retained divergent: $p" }

  $isEmpty = ($plan.Adds.Count -eq 0) -and ($plan.Updates.Count -eq 0) -and ($plan.Prunes.Count -eq 0)
  if ($isEmpty) {
    # Best-effort only (standards/governance-sync.md § "The standing-issue
    # rule"): a human can adopt a structure change by hand, leaving a stale
    # open issue this cleans up, but "nothing to sync" must still print and
    # exit 0 even when gh cannot be resolved or reached.
    try {
      $gh = Resolve-GhPath -ProfileGhPath $profileGhPath
      if (-not $pushedLocation) {
        Push-Location $ChildRoot
        $pushedLocation = $true
      }
      Close-StandingStructureIssue -Gh $gh -Reason 'Governance sync found nothing pending; closing the standing structure issue.'
    } catch {
      [Console]::Error.WriteLine("governance-sync: warning: could not close a stale standing structure issue ($($_.Exception.Message))")
    }
    # Retained-divergent entries alone never open a PR: there is no diff to
    # merge, and their WARNING lines above are the whole surface.
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
  $bodyLines.Add('Review per `standards/governance-sync.md`: does the new global content contradict a rule this repo declares in `CLAUDE.md` under `## Governance overrides`?')
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
  $bodyLines.Add('Retained divergent (dispose of by hand: delete the file, or keep it by declaring it under `## Governance overrides`):')
  foreach ($p in $plan.RetainedDivergent) { $bodyLines.Add("- $p") }
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
    $existingUrl = $existing[0].url
    & $gh pr edit $existingUrl --body-file $prBodyPath | Out-Null
    if ($LASTEXITCODE -ne 0) {
      [Console]::Error.WriteLine("governance-sync: gh pr edit failed for $existingUrl (exit $LASTEXITCODE)")
      exit 2
    }
    Write-Output "sync PR open: $existingUrl"
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
    $newUrl = @($createOut) | Where-Object { $_ -match '^https?://' } | Select-Object -Last 1
    if (-not $newUrl) {
      $recoverOut = & $gh pr list --head $branchName --state open --json url
      if ($LASTEXITCODE -eq 0) {
        $recoverParsed = ($recoverOut -join "`n") | ConvertFrom-Json
        if ($null -ne $recoverParsed) {
          $recovered = @($recoverParsed)
          if ($recovered.Count -gt 0) {
            $newUrl = $recovered[0].url
          }
        }
      }
    }
    if (-not $newUrl) {
      [Console]::Error.WriteLine("governance-sync: gh pr create exited 0 but no PR URL could be captured from its output or recovered via gh pr list")
      exit 2
    }
    Write-Output "sync PR opened: $newUrl"
  }

  # Close deferred to here, after the PR is open and its URL printed, not
  # before the branch is built: closing earlier would leave the child with
  # neither an open PR nor a standing issue if the push or `gh pr create`
  # below it failed.
  if ($closeStandingIssueAfterShip) {
    Close-StandingStructureIssue -Gh $gh -Reason 'Governance sync shipped with nothing withheld; closing the standing structure issue.'
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
