# start-run: steps 01 and 02 of a build in one command (pipeline/steps/01-isolate.md).
# It gives the run an issue number, its own up-to-date worktree, the governance sync, a run note,
# and the twelve steps as a to-do list. It composes the existing tools (assert-worktree,
# new-agent-worktree, check-freshness, governance-sync) and copies none of them.
#
#   start-run.ps1 -Goal "start and ship scripts" [-Issue 194]
#   start-run.ps1 -Goal "opus to fable" -Lane        # configuration lane: no issue, no run note
#
# With -Issue it uses that backlog issue. Without it, it files a placeholder issue (label
# needs-issue-review, never owner-approved) so the run has a number from its first minute; step 05
# then fills that issue in. The run note goes in .run_state/ at the project root, the primary
# checkout, not the worktree, as .claude/agents/orchestrator.md keeps .run_state/hard.
#
# Exit 0: ready, work in the printed worktree. Exit 1: not ready, and the output says why.
# Windows PowerShell 5.1-compatible: no ternary, no ??, no && or ||.
param(
  [Parameter(Mandatory = $true)]
  [string]$Goal,
  [int]$Issue = 0,
  [switch]$Lane
)

# Set once a placeholder is filed, so a stop says how to run again without filing a second one.
$script:rerunHint = ''

function Stop-Run([string]$Message) {
  [Console]::Error.WriteLine("start-run: $Message$script:rerunHint")
  exit 1
}

$Goal = $Goal.Trim()
if (-not $Goal) { Stop-Run 'the goal is empty. Pass a few words, such as -Goal "start and ship scripts".' }
if ($Goal.Contains('"')) { Stop-Run 'the goal cannot hold a double quote; Windows PowerShell 5.1 would split it into extra gh fields.' }
if ($Lane -and $PSBoundParameters.ContainsKey('Issue')) { Stop-Run 'the configuration lane has no issue; drop -Issue.' }
if ($PSBoundParameters.ContainsKey('Issue') -and $Issue -le 0) { Stop-Run "-Issue must be a positive issue number, not '$Issue'." }

$top = "$(& git rev-parse --show-toplevel 2>$null)".Trim()
if (-not $top) { Stop-Run 'not inside a git repo.' }
$commonDir = "$(& git rev-parse --path-format=absolute --git-common-dir 2>$null)".Trim()
if (-not $commonDir) { Stop-Run 'could not find the repo''s shared git folder.' }
$projectRoot = Split-Path $commonDir -Parent

# Lowercase words for the session name, and a slug for the branch.
$words = ($Goal.ToLowerInvariant() -replace '\s+', ' ')
$slug = ($words -replace '[^a-z0-9]+', '-').Trim('-')
if ($slug.Length -gt 40) { $slug = $slug.Substring(0, 40).Trim('-') }
if (-not $slug) { Stop-Run "the goal '$Goal' has no letters or digits to name a branch with." }

# ---- 1. An issue number -----------------------------------------------------
if ($Lane) {
  Write-Output 'issue: none (configuration lane)'
} elseif ($Issue -eq 0) {
  . (Join-Path $PSScriptRoot 'repo-profile-core.ps1')
  . (Join-Path $PSScriptRoot 'governance-sync-core.ps1')
  try {
    $gh = Resolve-GhPath -ProfileGhPath (Get-RepoProfileValue -Field 'ghPath')
  } catch {
    Stop-Run "$($_.Exception.Message) No issue was filed."
  }
  $out = & $gh api 'repos/{owner}/{repo}/issues' -f "title=$Goal" -f 'body=Placeholder: step 05 fills this in.' -f 'labels[]=needs-issue-review' --jq '.number' 2>&1
  $filed = "$out".Trim()
  if ($LASTEXITCODE -ne 0 -or $filed -notmatch '^\d+$') {
    Stop-Run "filing the placeholder issue failed: $filed"
  }
  $Issue = [int]$filed
  $script:rerunHint = " Run again with -Issue $Issue, so no second placeholder is filed."
  Write-Output "issue: #$Issue filed as a placeholder; step 05 fills it in."
} else {
  Write-Output "issue: #$Issue"
}
if ($Lane) {
  $branch = "lane-$slug"
  Write-Output "session name: $words"
} else {
  $branch = "$Issue-$slug"
  Write-Output "session name: $Issue $words"
}

# ---- 2. A worktree ----------------------------------------------------------
$worktree = $null
# A child process, so assert-worktree's own message for the primary checkout stays out of the output.
$shell = (Get-Process -Id $PID).Path
$null = & $shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'assert-worktree.ps1') 2>&1
if ($LASTEXITCODE -eq 0) {
  $worktree = $top
  Write-Output "worktree: $worktree (already in one)"
} else {
  # Reuse this branch's worktree if one is already checked out.
  $current = $null
  foreach ($line in @(& git worktree list --porcelain)) {
    if ($line -like 'worktree *') { $current = $line.Substring(9) }
    if ($line -eq "branch refs/heads/$branch") { $worktree = $current }
  }
  if ($worktree) {
    Write-Output "worktree: $worktree (reused)"
  } else {
    $made = @(& (Join-Path $PSScriptRoot 'new-agent-worktree.ps1') -Branch $branch)
    if ($LASTEXITCODE -ne 0) { Stop-Run "could not make a worktree for '$branch'; see the message above." }
    $ready = "$($made | Where-Object { $_ -like 'worktree ready: *' } | Select-Object -First 1)"
    if ($ready -notmatch '^worktree ready: (.+) \(branch ') { Stop-Run "new-agent-worktree gave no path: $($made -join ' ')" }
    $worktree = $Matches[1]
    Write-Output "worktree: $worktree (new, branch $branch)"
  }
}

# ---- 3. Fresh, then synced --------------------------------------------------
Push-Location -LiteralPath $worktree
try {
  $fresh = @(& (Join-Path $worktree 'tools/check-freshness.ps1'))
  $freshExit = $LASTEXITCODE
  $fresh | ForEach-Object { Write-Output "freshness: $_" }
  if ($freshExit -ne 0) { Stop-Run 'the worktree is not current. Catch up as the freshness line says, then run start-run again.' }

  $sync = @(& (Join-Path $worktree 'tools/governance-sync.ps1') 2>&1)
  $syncExit = $LASTEXITCODE
  $sync | ForEach-Object { Write-Output "sync: $_" }
  if ($syncExit -ne 0) { Write-Output 'sync: failed; carry on with the rules in the tree, and the next run closes the gap.' }
} finally {
  Pop-Location
}

# ---- 4. The run note --------------------------------------------------------
$stateDir = Join-Path $projectRoot '.run_state'
$note = Join-Path $stateDir "$Issue.md"
if ($Lane) {
  Write-Output 'run note: none (configuration lane)'
} elseif (Test-Path -LiteralPath $note) {
  Write-Output "run note: $note (kept)"
} else {
  New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
  $body = @("# $Issue $words", '', 'Step: 03 research.', 'Owner''s last answer: none yet.', '', '## Decisions', '')
  Set-Content -LiteralPath $note -Value $body -Encoding utf8
  Write-Output "run note: $note"
}

# ---- 5. The to-do list ------------------------------------------------------
Write-Output 'to-do:'
$pipeline = Join-Path $worktree 'pipeline/PIPELINE.md'
foreach ($line in @(Get-Content -LiteralPath $pipeline)) {
  if ($line -match '^(\d+)\. \*\*([^*]+)\*\*') { Write-Output "  $($Matches[1]). $($Matches[2])" }
}
exit 0
