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
    # Retained-divergent entries alone never open a PR: there is no diff to
    # merge, and their WARNING lines above are the whole surface.
    Write-Output "in sync with $parentSha"
    exit 0
  }

  # Step h: resolve gh before any mutation -- nothing exists yet to orphan if
  # this fails.
  $gh = Resolve-GhPath -ProfileGhPath $profileGhPath
  $branchName = "issue-$syncIssue-governance-sync-$shortSha"

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
  $stageAddUpdate = @($plan.Adds) + @($plan.Updates)
  if ($stageAddUpdate.Count -gt 0) {
    & git -C $syncWorktreeDir add -f -- $stageAddUpdate | Out-Null
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

  Push-Location $ChildRoot
  $pushedLocation = $true
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
