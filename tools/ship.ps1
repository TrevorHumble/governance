# ship: step 11 of a build in one command (pipeline/steps/11-ship.md). Run it from the run's
# worktree once the change is committed (step 10).
#
#   ship.ps1 -Issue 194 -Title "Start and ship a run with one command each" -Entry "<buildlog detail>"
#   ship.ps1 -Lane -Body "<check:seats output>" [-Issue 111]    # configuration lane: stops at green
#   ship.ps1 -Lane -Merge                                         # after the owner's yes in chat
#
# A build: copies the run note's "## Decisions" section into the PR body, pushes, opens the PR (or
# reuses the open one), writes and checks buildlog/<N>-<PR>.md, waits for every required check
# (ciCheckNames in repo-profile.json) on the head commit to finish green, squash-merges, and closes
# the issue. Red stops it and names the check; run it again after the fix and it picks up where it
# stopped.
#
# The lane: no decision lines, no buildlog fragment, never closes an issue (the standing #111 stays
# open), and merges only on the separate -Lane -Merge run. -Issue there only adds an "Issue: #N"
# line to the PR body. Every merge passes the head commit it waited on, so nothing pushed after the
# green check can be merged.
#
# GitHub calls go through REST (`gh api`) only, as .claude/skills/github-write/SKILL.md says. The run
# note is read from .run_state/ at the project root, where tools/start-run.ps1 writes it.
# Exit 0: done (or, for the lane, green and waiting for the owner). Exit 1: stopped; the output says why.
# Windows PowerShell 5.1-compatible.
param(
  [int]$Issue = 0,
  [string]$Title,
  [string]$Entry,
  [switch]$Lane,
  [switch]$Merge,
  [string]$Body,
  [int]$TimeoutMinutes = 30
)

function Stop-Ship([string]$Message) {
  [Console]::Error.WriteLine("ship: $Message")
  exit 1
}

. (Join-Path $PSScriptRoot 'repo-profile-core.ps1')
. (Join-Path $PSScriptRoot 'governance-sync-core.ps1')

if ((Get-RepoProfileValue -Field 'shipMode' -Default 'pr') -eq 'direct') {
  Stop-Ship 'shipMode is direct, so there is no PR to ship. Follow the direct-mode paragraph in pipeline/steps/11-ship.md.'
}
if ($Merge -and -not $Lane) { Stop-Ship '-Merge is only for the configuration lane (-Lane -Merge). A build merges on green by itself.' }

try {
  $gh = Resolve-GhPath -ProfileGhPath (Get-RepoProfileValue -Field 'ghPath')
} catch {
  Stop-Ship $_.Exception.Message
}

$defaultBranch = Get-RepoProfileValue -Field 'defaultBranch'
# The checks a merge waits for. GitHub refuses a merge while a required one is still running.
$requiredChecks = @(Get-RepoProfileValue -Field 'ciCheckNames' -Default @('build'))
$branch = "$(& git rev-parse --abbrev-ref HEAD 2>$null)".Trim()
if (-not $branch -or $branch -eq 'HEAD') { Stop-Ship 'not on a branch.' }
if ($branch -eq $defaultBranch) { Stop-Ship "on $defaultBranch. Ship from the run's own branch." }
# Work from the repo root, so the buildlog fragment lands in root buildlog/ wherever ship was run from.
Set-Location -LiteralPath "$(& git rev-parse --show-toplevel)".Trim()

$pollSeconds = 20
$pinSeconds = 3
if ($env:SHIP_POLL_SECONDS) { $pollSeconds = [int]$env:SHIP_POLL_SECONDS; $pinSeconds = $pollSeconds }

# Calls gh, returns trimmed stdout with its lines kept apart, stops the ship on a non-zero exit.
function Invoke-Gh {
  param([string]$What, [string[]]$GhArgs)
  $out = & $gh @GhArgs 2>&1
  if ($LASTEXITCODE -ne 0) { Stop-Ship "$What failed: $("$out".Trim())" }
  return (@($out | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Get-OpenPr {
  $n = Invoke-Gh 'finding the open PR' @('api', "repos/{owner}/{repo}/pulls?head={owner}:$branch&state=open", '--jq', '.[0].number // empty')
  if ($n -match '^\d+$') { return [int]$n }
  return 0
}

# Waits for every required check on the commit. Returns only when each has a run and all its runs
# finished green. A check with no run yet counts as still waiting.
function Wait-Green([string]$Sha) {
  $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
  while ($true) {
    $out = Invoke-Gh 'reading checks' @('api', "repos/{owner}/{repo}/commits/$Sha/check-runs?per_page=100", '--jq', '.check_runs[] | [.name, .status, (.conclusion // ""), .html_url] | @tsv')
    $runs = @("$out" -split "`r?`n" | Where-Object { $_.Trim() } | ForEach-Object {
        $f = $_ -split "`t"
        if ($requiredChecks -contains $f[0]) { [PSCustomObject]@{ Name = $f[0]; Status = $f[1]; Conclusion = $f[2]; Url = $f[3] } }
      })
    $red = @($runs | Where-Object { $_.Status -eq 'completed' -and $_.Conclusion -ne 'success' })
    if ($red.Count -gt 0) {
      Stop-Ship "the $($red[0].Name) check finished $($red[0].Conclusion) on $($Sha.Substring(0, 7)): $($red[0].Url). Nothing was merged. Fix the cause, commit, and run ship again."
    }
    $running = @($runs | Where-Object { $_.Status -ne 'completed' } | ForEach-Object { $_.Name })
    $seen = @($runs | ForEach-Object { $_.Name })
    $waiting = @($requiredChecks | Where-Object { $running -contains $_ -or $seen -notcontains $_ })
    if ($waiting.Count -eq 0) { return }
    if ((Get-Date) -gt $deadline) { Stop-Ship "not green after $TimeoutMinutes minutes: $($waiting -join ', '). Nothing was merged. Run ship again to keep waiting." }
    Start-Sleep -Seconds $pollSeconds
  }
}

# The PR's head commit, which must be the local HEAD. The wait and the merge both use it, and the
# merge passes it as `sha`, so GitHub refuses the merge if anything was pushed after the check.
# GitHub can take a few seconds to move a PR's head after a push, so it asks up to five times.
function Get-PinnedHead([int]$Pr) {
  $local = "$(& git rev-parse HEAD)".Trim()
  for ($try = 1; $try -le 5; $try++) {
    $remote = Invoke-Gh "reading PR #$Pr" @('api', "repos/{owner}/{repo}/pulls/$Pr", '--jq', '.head.sha')
    if ($remote -eq $local) { break }
    if ($try -lt 5) { Start-Sleep -Seconds $pinSeconds }
  }
  if ($remote -ne $local) {
    Stop-Ship "PR #$Pr's head is $remote but this worktree is at $local. Nothing was merged. Pull or push so they match, then run ship again."
  }
  return $local
}

function Merge-Pr([int]$Pr, [string]$Sha) {
  $null = Invoke-Gh "merging PR #$Pr" @('api', '-X', 'PUT', "repos/{owner}/{repo}/pulls/$Pr/merge", '-f', 'merge_method=squash', '-f', "sha=$Sha")
  Write-Output "merged: PR #$Pr at $($Sha.Substring(0, 7))"
}

# ---- The lane, second run: merge after the owner's yes ----------------------
if ($Lane -and $Merge) {
  $pr = Get-OpenPr
  if ($pr -eq 0) { Stop-Ship "no open PR for $branch." }
  $sha = Get-PinnedHead $pr
  Wait-Green $sha
  Merge-Pr $pr $sha
  exit 0
}

# ---- What goes in the PR body -----------------------------------------------
$bodyText = $null
if ($Lane) {
  if (-not "$Body".Trim()) { Stop-Ship '-Lane needs -Body, the npm run check:seats output for the PR body.' }
  $bodyText = $Body.Trim()
  if ($Issue -gt 0) { $bodyText = "$bodyText`n`nIssue: #$Issue" }
} else {
  if ($Issue -le 0) { Stop-Ship '-Issue <N> is required for a build.' }
  if (-not "$Title".Trim()) { Stop-Ship '-Title is required: the PR title.' }
  if (-not "$Entry".Trim()) { Stop-Ship '-Entry is required: the buildlog detail after the summary (buildlog/README.md).' }
  $commonDir = "$(& git rev-parse --path-format=absolute --git-common-dir 2>$null)".Trim()
  $note = Join-Path (Join-Path (Split-Path $commonDir -Parent) '.run_state') "$Issue.md"
  if (-not (Test-Path -LiteralPath $note)) { Stop-Ship "no run note at $note." }
  $inDecisions = $false
  $decisions = @()
  foreach ($line in @(Get-Content -LiteralPath $note -Encoding utf8)) {
    if ($line -match '^##\s') { $inDecisions = ($line -match '^##\s+Decisions\s*$'); continue }
    if ($inDecisions) { $decisions += $line }
  }
  $bodyText = ($decisions -join "`n").Trim()
  if (-not $bodyText) { Stop-Ship "the Decisions section of $note is empty. Write the decision lines there first (the implementing skill)." }
  $bodyText = "$bodyText`n`nIssue: #$Issue"
}

$dirty = "$(& git status --porcelain)".Trim()
if ($dirty) { Stop-Ship 'the worktree has uncommitted changes. Commit them first (step 10).' }

# ---- Already shipped? A re-run after the merge only closes the issue ---------
# Checked before freshness and the push: once merged, main holds this branch's files, so freshness
# would report an overlap, and the branch may already be deleted on GitHub.
if (-not $Lane -and (Get-OpenPr) -eq 0) {
  $merged = Invoke-Gh 'looking for a merged PR' @('api', "repos/{owner}/{repo}/pulls?head={owner}:$branch&state=closed", '--jq', '[.[] | select(.merged_at != null)][0].number // empty')
  if ($merged -match '^\d+$') {
    $null = Invoke-Gh "closing #$Issue" @('api', '-X', 'PATCH', "repos/{owner}/{repo}/issues/$Issue", '-f', 'state=closed', '-f', 'state_reason=completed')
    Write-Output "already shipped: PR #$merged merged; #$Issue closed."
    exit 0
  }
}

# ---- Current with the default branch, then push, then the PR ----------------
$fresh = @(& (Join-Path $PSScriptRoot 'check-freshness.ps1'))
if ($LASTEXITCODE -ne 0) { Stop-Ship "$($fresh -join ' ') Nothing was pushed or merged. Catch up, commit, and run ship again." }

& git push -u origin $branch 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Stop-Ship "git push of $branch failed." }

$pr = Get-OpenPr
if ($pr -eq 0) {
  $bodyFile = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllText($bodyFile, $bodyText)
  $prTitle = $Title
  if (-not "$prTitle".Trim()) { $prTitle = "$(& git log -1 --format=%s)".Trim() }
  if ($prTitle.Contains('"')) { Stop-Ship 'the PR title cannot hold a double quote; Windows PowerShell 5.1 would split it into extra gh fields. Pass -Title without one.' }
  $created = Invoke-Gh 'opening the PR' @('api', 'repos/{owner}/{repo}/pulls', '-f', "head=$branch", '-f', "base=$defaultBranch", '-f', "title=$prTitle", '-F', "body=@$bodyFile", '--jq', '.number')
  Remove-Item -LiteralPath $bodyFile -ErrorAction SilentlyContinue
  if ($created -notmatch '^\d+$') { Stop-Ship "opening the PR gave no number: $created" }
  $pr = [int]$created
  Write-Output "PR: #$pr opened"
} else {
  Write-Output "PR: #$pr (already open)"
}

# ---- The buildlog fragment (builds only) ------------------------------------
if (-not $Lane) {
  $fragment = "buildlog/$Issue-$pr.md"
  if (Test-Path -LiteralPath $fragment) {
    Write-Output "buildlog: $fragment (already there)"
  } else {
    $date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
    $line = "- $date - #$Issue $($Title.Trim()) (PR #$pr). $($Entry.Trim())"
    New-Item -ItemType Directory -Force -Path 'buildlog' | Out-Null
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) $fragment), "$line`n")
    $check = & node (Join-Path $PSScriptRoot '..\scripts\check-buildlog-entry.js') $fragment 2>&1
    if ($LASTEXITCODE -ne 0) {
      Remove-Item -LiteralPath $fragment
      Stop-Ship "$("$check".Trim()) Fix -Entry and run ship again."
    }
    & git add -- $fragment
    & git commit -q -m "Buildlog fragment for #$Issue" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Stop-Ship "committing $fragment failed." }
    & git push origin $branch 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Stop-Ship "git push of the buildlog fragment failed." }
    Write-Output "buildlog: $fragment"
  }
}

# ---- Green, then merge ------------------------------------------------------
$sha = Get-PinnedHead $pr
Write-Output "checks: waiting for $($requiredChecks -join ', ') to go green"
Wait-Green $sha
Write-Output 'checks: green'

if ($Lane) {
  Write-Output "lane: PR #$pr is green. Show the owner the check output; after their yes in chat, run: tools/ship.ps1 -Lane -Merge"
  exit 0
}

Merge-Pr $pr $sha
$null = Invoke-Gh "closing #$Issue" @('api', '-X', 'PATCH', "repos/{owner}/{repo}/issues/$Issue", '-f', 'state=closed', '-f', 'state_reason=completed')
Write-Output "closed: #$Issue"
exit 0
