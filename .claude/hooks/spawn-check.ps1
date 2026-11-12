# spawn-check: a PreToolUse hook on Agent. It denies a spawn whose model or effort differs from its
# seat in seats.json. The seat comes from a role tag that starts the spawn's description: [<role>],
# or [<role> hard] for the hard award. It denies a missing or unknown tag rather than guess, a tag
# without hard while .run_state/hard exists for a role the award covers, and a reviewer role (a role
# whose agent is "reviewer" in seats.json) unless run_in_background is exactly false, so that
# reviewer-done can fire when the reviewer returns. A reviewer may share the session's model.
# It is also the approval gate: where .claude/settings.json wires before-issue-create.ps1, an issue-reviewer
# spawn must name its issue as #<N>, and is denied unless that issue carries owner-approved (read
# with gh api, 5 seconds at most; a failed or slow read denies). A repo without that wiring is not
# gated.
# The project root (seats.json, .run_state) is CLAUDE_PROJECT_DIR, else the input's cwd.
# The reason text lives in notes.md; if that file cannot be read, one generic line still denies.
# It fails closed on a spawn it can judge, as before-issue-create does: input that is not empty but
# cannot be parsed is denied, and so is any call when hook-core.ps1 cannot be loaded. It allows, silently, on empty input, on input with no tool_input, when
# seats.json cannot be read, and on any other exception.
# Not covered: only the Agent tool is seen. A model started another way (claude -p through Bash, a
# remote session, a connector) is never checked, and the role tag is the agent's own word.
$ErrorActionPreference = 'Stop'

$FALLBACK = 'denied; see .claude/hooks/notes.md.'

function Write-Deny([string[]]$keys, [hashtable]$values = @{}) {
  $parts = @($keys | ForEach-Object { Get-Note 'spawn-check' $_ })
  $text = if ($parts.Count -ne $keys.Count -or $parts -contains $null) { $FALLBACK } else { Fill ($parts -join ' ') $values }
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'PreToolUse'; permissionDecision = 'deny'; permissionDecisionReason = "spawn-check: $text" } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
}

# The approval gate: in a repo whose settings wire before-issue-create.ps1 (which guards the
# label), an issue-reviewer spawn names its
# issue as #<N>, and that issue carries owner-approved. $null passes; otherwise the note key and
# values to deny with. A missing number, a lookup that fails or takes over 5 seconds, or any
# exception here denies.
function Test-ApprovalGate([string]$root, $description) {
  try {
    $settings = Join-Path $root '.claude/settings.json'
    if (-not (Test-Path -LiteralPath $settings -PathType Leaf)) { return $null }
    if ((Get-Content -LiteralPath $settings -Raw) -notmatch 'hooks/before-issue-create\.ps1') { return $null }
    # One issue per review: #N, or owner/name#N for an issue in another repo.
    $named = @([regex]::Matches([string]$description, '(?:([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+))?#([0-9]+)') |
        ForEach-Object { "$($_.Groups[1].Value)#$($_.Groups[2].Value)" } | Select-Object -Unique)
    if ($named.Count -ne 1) { return @{ Key = 'no-issue'; Values = @{} } }
    $repo, $number = $named[0] -split '#', 2
    $fail = @{ Key = 'not-approved'; Values = @{ number = $number; why = ' (its labels could not be read)' } }
    if (-not $repo) {
      $url = (& git -C $root remote get-url origin 2>$null | Select-Object -First 1)
      if ([string]$url -notmatch 'github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?/?$') { return $fail }
      $repo = "$($Matches[1])/$($Matches[2])"
    }
    # The remote is the agent's to set, so only plain owner/name reaches the gh command line.
    if ($repo -cnotmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { return $fail }
    $gh = $env:GOVERNANCE_GH
    if (-not $gh) {
      $cmd = Get-Command gh -ErrorAction SilentlyContinue
      $gh = if ($cmd) { $cmd.Source } else { 'C:\Program Files\GitHub CLI\gh.exe' }
    }
    $ghArgs = "api repos/$repo/issues/$number --jq .labels[].name"
    $info = New-Object System.Diagnostics.ProcessStartInfo
    if ($gh -like '*.ps1') {
      $info.FileName = (Get-Process -Id $PID).Path
      $info.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$gh`" $ghArgs"
    } else { $info.FileName = $gh; $info.Arguments = $ghArgs }
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $proc = [System.Diagnostics.Process]::Start($info)
    $out = $proc.StandardOutput.ReadToEndAsync()
    if (-not $proc.WaitForExit(5000)) { try { $proc.Kill() } catch { }; return $fail }
    if ($proc.ExitCode -ne 0) { return $fail }
    $labels = @($out.Result -split "`r?`n" | ForEach-Object { $_.Trim() })
    if ($labels -ccontains 'owner-approved') { return $null }
    return @{ Key = 'not-approved'; Values = @{ number = $number; why = '' } }
  } catch {
    return @{ Key = 'not-approved'; Values = @{ number = '?'; why = ' (the check failed)' } }
  }
}

$coreLoaded = $false
try { . (Join-Path $PSScriptRoot 'hook-core.ps1'); $coreLoaded = $true } catch { }

try {
  if (-not $coreLoaded) {
    # Fail closed like before-issue-create: no core means no seat check, so deny any real call.
    if ([Console]::In.ReadToEnd().Trim() -eq '') { exit 0 }
    $out = [ordered]@{ hookSpecificOutput = [ordered]@{
        hookEventName = 'PreToolUse'; permissionDecision = 'deny'; permissionDecisionReason = "spawn-check: $FALLBACK" } }
    Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
    exit 0
  }
  $raw = Read-Stdin
  if ($raw.Trim() -eq '') { exit 0 }
  try { $payload = $raw | ConvertFrom-Json } catch { Write-Deny @('unreadable'); exit 0 }
  if ($null -eq $payload -or $null -eq $payload.tool_input) { exit 0 }

  $root = Get-ProjectRoot $payload
  $seats = Read-Seats $root
  if ($null -eq $seats) { exit 0 }
  $roles = @($seats.roles.PSObject.Properties.Name)
  $list = $roles -join ', '

  $tag = Get-RoleTag $payload.tool_input.description
  if ($null -eq $tag) { Write-Deny @('no-tag') @{ roles = $list }; exit 0 }
  $role = $tag.Role
  $hard = $tag.Hard
  if ($roles -cnotcontains $role) { Write-Deny @('unknown', 'no-tag') @{ tag = $role; roles = $list }; exit 0 }

  $award = $null
  $hardAwards = Get-HardAwards $seats
  if ($hardAwards) {
    $p = $hardAwards.PSObject.Properties[$role]
    if ($p) { $award = $p.Value }
  }
  if ($hard -and $null -eq $award) { Write-Deny @('unknown') @{ tag = "$role hard" }; exit 0 }
  if (-not $hard -and $null -ne $award -and (Test-Path -LiteralPath (Join-Path $root '.run_state/hard') -PathType Leaf)) {
    Write-Deny @('hard-run') @{ role = $role }
    exit 0
  }

  $background = $payload.tool_input.run_in_background
  if ((Get-ReviewerRoles $seats) -ccontains $role -and -not ($background -is [bool] -and $background -eq $false)) {
    Write-Deny @('foreground')
    exit 0
  }

  if ($role -ceq 'issue-reviewer') {
    $gate = Test-ApprovalGate $root $payload.tool_input.description
    if ($gate) { Write-Deny @($gate.Key) $gate.Values; exit 0 }
  }

  $seat = if ($hard) { $award } else { $seats.roles.$role }
  $label = if ($hard) { "$role hard" } else { $role }
  $alias = Get-Family $seat.model
  $effort = [string]$seat.effort
  $model = Get-Family $payload.tool_input.model
  $passed = $payload.tool_input.effort
  if ($passed -isnot [string] -and $null -ne $passed -and $passed.PSObject.Properties['level']) { $passed = $passed.level }
  $passed = if ($passed -is [string]) { $passed.ToLowerInvariant() } else { $null }

  if ($model -ne $alias -or $passed -ne $effort.ToLowerInvariant()) {
    Write-Deny @('wrong-seat') @{ tag = $label; alias = $alias; effort = $effort
      model = $(if ($model) { $model } else { 'none' }); passed = $(if ($passed) { $passed } else { 'none' }) }
  }
  exit 0
} catch {
  exit 0
}
