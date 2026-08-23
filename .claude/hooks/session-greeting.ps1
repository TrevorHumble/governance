# session-greeting: a SessionStart hook. Two jobs, both fast, local, and idempotent
# (NO network calls -- a SessionStart hook is on the critical path of opening the
# project, so it must always return in well under a second):
#   1. SELF-ARMS the local hooks if they're dormant (a clone doesn't carry
#      core.hooksPath; this `git config` is what makes "clone and it just works"
#      true -- the hooks arm the moment you open the project in Claude Code).
#   2. GREETS with the honest current state, so the owner sees positive evidence
#      they're protected -- and is told if their git identity still needs setting.
# Fail-safe: any error -> no action, no greeting.
try {
  $top = (& git rev-parse --show-toplevel 2>$null)
  if (-not $top) { exit 0 }

  # 1. Arm the local hooks if dormant (local git config, idempotent).
  $commitMsgFile = Join-Path $top '.githooks/commit-msg'
  $preCommitFile = Join-Path $top '.githooks/pre-commit'
  $hp = "$(& git -C $top config --get core.hooksPath)".Trim()
  if ($hp -ne '.githooks' -and (Test-Path $commitMsgFile)) {
    . (Join-Path $top 'tools/setup-hooks.ps1')
    if (Set-HooksPath -RepoRoot $top) { $hp = '.githooks' }
  }
  # Liveness reads BOTH hook files, not commit-msg alone, so a repo missing
  # pre-commit is reported as missing pre-commit, not waved through as armed.
  $missingHooks = @()
  if (-not (Test-Path $commitMsgFile)) { $missingHooks += '.githooks/commit-msg' }
  if (-not (Test-Path $preCommitFile)) { $missingHooks += '.githooks/pre-commit' }
  $hookOn = ($hp -eq '.githooks' -and $missingHooks.Count -eq 0)

  # governanceHome "self" is one repo-profile.json state where the
  # parent-ownership hook (.githooks/pre-commit) exits 0 without ever
  # reading governance-manifest.json -- see that hook's own header. A repo
  # with no repo-profile.json at all is a second such state: that hook's own
  # header treats a missing profile as "the wall is off", exiting 0 before it
  # even looks for a PowerShell launcher. Both hook files being present and
  # armed is not the same claim as this repo being protected by the
  # ownership rule; the greeting must not conflate them.
  #
  # The reader (tools/repo-profile-core.ps1) is itself a shared path that can
  # arrive at a child out of step with this script (both sync independently),
  # so its absence is tested before dot-sourcing it rather than left to the
  # outer catch: a missing dot-sourced file raises, and the outer catch would
  # silence the whole greeting, including the hooks-missing warning below,
  # which has nothing to do with the profile reader.
  $profilePath = Join-Path $top 'repo-profile.json'
  $profileExists = Test-Path $profilePath
  $readerPath = Join-Path $top 'tools/repo-profile-core.ps1'
  $readerMissing = -not (Test-Path $readerPath)
  $isGovernanceHome = $false
  if (-not $readerMissing) {
    . $readerPath
    $isGovernanceHome = ($profileExists -and (Get-RepoProfileValue -Field 'governanceHome' -ProfilePath $profilePath) -eq 'self')
  }

  # 2. Greet (honest state). Local identity check only -- no network.
  $haveEmail = "$(& git -C $top config user.email)".Trim()
  $idNote = if ($haveEmail) { '' } else { ' Set your git name/email before your first commit.' }

  if ($hookOn -and $readerMissing) {
    $msg = "Gates armed: the issue-reference commit-msg hook is active. The ownership wall's state could not be read -- tools/repo-profile-core.ps1 is missing, so whether the parent-ownership pre-commit hook is protecting this repo is unknown. Goal gate + loop gate loaded.$idNote"
  } elseif ($hookOn -and -not $profileExists) {
    $msg = "Gates armed: the issue-reference commit-msg hook is active. The parent-ownership pre-commit hook is installed but inert here -- no repo-profile.json declares this repo a child, so it enforces nothing here. Goal gate + loop gate loaded.$idNote"
  } elseif ($hookOn -and $isGovernanceHome) {
    $msg = "Gates armed: the issue-reference commit-msg hook is active. The parent-ownership pre-commit hook is installed but inert here -- this repo is the governance home, so it enforces nothing here by design. Goal gate + loop gate loaded.$idNote"
  } elseif ($hookOn) {
    $msg = "Gates armed: the issue-reference commit-msg hook and the parent-ownership pre-commit hook are both active, goal gate + loop gate loaded. You're protected -- direct away.$idNote"
  } elseif ($missingHooks.Count -gt 0) {
    $msg = "Goal gate + loop gate loaded, but $($missingHooks -join ' and ') missing -- check .githooks/, or run: powershell -ExecutionPolicy Bypass -File tools/setup-hooks.ps1"
  } else {
    $msg = "Goal gate + loop gate loaded, but git config core.hooksPath could not be set -- run: powershell -ExecutionPolicy Bypass -File tools/setup-hooks.ps1 to see the error"
  }
  Write-Output (@{ systemMessage = $msg } | ConvertTo-Json -Compress)
} catch {
  exit 0
}
