# spawn-check: a PreToolUse hook on Agent. It denies a spawn whose model or effort differs from its
# seat in seats.json. The seat comes from a role tag that starts the spawn's description: [<role>],
# or [<role> hard] for the hard award. It denies a missing or unknown tag rather than guess, and a
# tag without hard while .run_state/hard exists for a role the award covers.
# The project root (seats.json, .run_state) is CLAUDE_PROJECT_DIR, else the input's cwd.
# The reason text lives in notes.md; if that file cannot be read, a short fallback still denies.
# It fails closed on a judged spawn, as before-issue-create does, and allows on anything it cannot
# read: unreadable input, no seats.json, or any exception.
$ErrorActionPreference = 'Stop'

function Get-Notes([string]$hook) {
  try {
    $text = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'notes.md'))
    $m = [regex]::Match($text, '(?ms)^## ' + [regex]::Escape($hook) + '[ \t]*\r?\n(.*?)(?=^## |\z)')
    $notes = @{}
    foreach ($line in ($m.Groups[1].Value -split '\r?\n')) {
      $kv = [regex]::Match($line, '^([a-z-]+): (.*?)\s*$')
      if ($kv.Success) { $notes[$kv.Groups[1].Value] = $kv.Groups[2].Value }
    }
    return $notes
  } catch { return @{} }
}

function Get-Family($id) {
  if ($id -isnot [string]) { return $null }
  $s = ($id.ToLowerInvariant() -replace '\[.*$', '').Trim()
  $m = [regex]::Match($s, '^claude-([a-z]+)')
  if ($m.Success) { return $m.Groups[1].Value }
  return $s
}

function Fill([string]$text, [hashtable]$values) {
  foreach ($k in $values.Keys) { $text = $text.Replace("{$k}", [string]$values[$k]) }
  return $text
}

function Write-Deny([string]$key, [string]$fallback, [hashtable]$values, [string]$prefix = '') {
  $notes = Get-Notes 'spawn-check'
  $text = if ($notes.ContainsKey($key)) { Fill $notes[$key] $values } else { $fallback }
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'PreToolUse'; permissionDecision = 'deny'
      permissionDecisionReason = "spawn-check: $prefix$text" } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
}

try {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $payload = $reader.ReadToEnd() | ConvertFrom-Json
  if ($null -eq $payload -or $null -eq $payload.tool_input) { exit 0 }

  $root = $env:CLAUDE_PROJECT_DIR
  if (-not $root -and $payload.cwd -is [string]) { $root = $payload.cwd }
  if (-not $root) { exit 0 }
  $seats = Get-Content -LiteralPath (Join-Path $root 'seats.json') -Raw | ConvertFrom-Json
  $roles = @($seats.roles.PSObject.Properties.Name)
  $list = $roles -join ', '

  $desc = $payload.tool_input.description
  $tag = if ($desc -is [string]) { [regex]::Match($desc, '^\s*\[([a-z][a-z0-9-]*)(?:\s+(hard))?\]') } else { $null }
  if ($null -eq $tag -or -not $tag.Success) {
    Write-Deny 'no-tag' "Start the description with a role tag, [role] or [role hard]. Roles: $list." @{ roles = $list }
    exit 0
  }
  $role = $tag.Groups[1].Value
  $hard = $tag.Groups[2].Success
  if ($roles -cnotcontains $role) {
    Write-Deny 'no-tag' "Start the description with a role tag, [role] or [role hard]. Roles: $list." @{ roles = $list } "'$role' is not a role. "
    exit 0
  }

  $award = $null
  if ($seats.PSObject.Properties['awards'] -and $seats.awards.PSObject.Properties['hard']) {
    $p = $seats.awards.hard.PSObject.Properties[$role]
    if ($p) { $award = $p.Value }
  }
  if ($hard -and $null -eq $award) {
    Write-Deny 'no-award' "$role has no hard award." @{ role = $role }
    exit 0
  }
  if (-not $hard -and $null -ne $award -and (Test-Path -LiteralPath (Join-Path $root '.run_state/hard') -PathType Leaf)) {
    Write-Deny 'hard-run' "This run is hard (.run_state/hard). Tag it [$role hard]." @{ role = $role }
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
    $shown = @{ tag = $label; alias = $alias; effort = $effort
      model = $(if ($model) { $model } else { 'none' }); passed = $(if ($passed) { $passed } else { 'none' }) }
    Write-Deny 'wrong-seat' "The $label seat is model $alias, effort $effort." $shown
  }
  exit 0
} catch {
  exit 0
}
