# spawn-check: a PreToolUse hook on Agent. It denies a spawn whose model or effort differs from its
# seat in seats.json. The seat comes from a role tag that starts the spawn's description: [<role>],
# or [<role> hard] for the hard award. It denies a missing or unknown tag rather than guess, a tag
# without hard while .run_state/hard exists for a role the award covers, and a reviewer role (a role
# whose agent is "reviewer" in seats.json) unless run_in_background is exactly false, so that
# reviewer-done can fire when the reviewer returns.
# The project root (seats.json, .run_state) is CLAUDE_PROJECT_DIR, else the input's cwd.
# The reason text lives in notes.md; if that file cannot be read, one generic line still denies.
# It fails closed on a spawn it can judge, as before-issue-create does: input that is not empty but
# cannot be parsed is denied, and so is any call when hook-core.ps1 cannot be loaded. It allows, silently, on empty input, on input with no tool_input, when
# seats.json cannot be read, and on any other exception.
# Not covered: only the Agent tool is seen. A model started another way (claude -p through Bash, a
# remote session, a connector) is never checked, and the role tag is the agent's own word.
$ErrorActionPreference = 'Stop'

$FALLBACK = 'denied; see _claude/hooks/notes.md.'

function Write-Deny([string[]]$keys, [hashtable]$values = @{}) {
  $parts = @($keys | ForEach-Object { Get-Note 'spawn-check' $_ })
  $text = if ($parts.Count -ne $keys.Count -or $parts -contains $null) { $FALLBACK } else { Fill ($parts -join ' ') $values }
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'PreToolUse'; permissionDecision = 'deny'; permissionDecisionReason = "spawn-check: $text" } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
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
