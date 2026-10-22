# session-greeting: a SessionStart hook. It adds a greeting the model reads before the first prompt,
# plus warnings when something would override the seats in seats.json:
#   - the session's model is neither the orchestrator seat nor its hard award (checked only when the
#     input carries `model`; after /clear or a recovery it does not, and the greeting says so);
#   - CLAUDE_CODE_EFFORT_LEVEL is set, or CLAUDE_CODE_SUBAGENT_MODEL_FORCE is 1;
#   - a maxEffortLevel in settings is below a seat's effort.
# The project root is CLAUDE_PROJECT_DIR, else the input's cwd. It never blocks; unreadable input
# prints nothing, and an unreadable seats.json drops the checks that need it.
$ErrorActionPreference = 'Stop'

$EFFORTS = @('low', 'medium', 'high', 'xhigh', 'max')

function Get-Notes([string]$hook) {
  $text = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'notes.md'))
  $m = [regex]::Match($text, '(?ms)^## ' + [regex]::Escape($hook) + '[ \t]*\r?\n(.*?)(?=^## |\z)')
  $notes = @{}
  foreach ($line in ($m.Groups[1].Value -split '\r?\n')) {
    $kv = [regex]::Match($line, '^([a-z-]+): (.*?)\s*$')
    if ($kv.Success) { $notes[$kv.Groups[1].Value] = $kv.Groups[2].Value }
  }
  return $notes
}

function Fill([string]$text, [hashtable]$values) {
  foreach ($k in $values.Keys) { $text = $text.Replace("{$k}", [string]$values[$k]) }
  return $text
}

function Get-Family($id) {
  if ($id -isnot [string]) { return $null }
  $s = ($id.ToLowerInvariant() -replace '\[.*$', '').Trim()
  $m = [regex]::Match($s, '^claude-([a-z]+)')
  if ($m.Success) { return $m.Groups[1].Value }
  return $s
}

# The lowest maxEffortLevel any settings file sets, as an index into $EFFORTS, or -1 for none.
function Get-LowestCap([string]$root) {
  $configDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
  $files = @((Join-Path $root '.claude/settings.json'), (Join-Path $root '.claude/settings.local.json'),
    (Join-Path $configDir 'settings.json'))
  $lowest = -1
  foreach ($f in $files) {
    try {
      $cap = (Get-Content -LiteralPath $f -Raw | ConvertFrom-Json).maxEffortLevel
      $i = if ($cap -is [string]) { $EFFORTS.IndexOf($cap.ToLowerInvariant()) } else { -1 }
      if ($i -ge 0 -and ($lowest -lt 0 -or $i -lt $lowest)) { $lowest = $i }
    } catch { }
  }
  return $lowest
}

try {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $payload = $reader.ReadToEnd() | ConvertFrom-Json
  if ($null -eq $payload) { exit 0 }
  $notes = Get-Notes 'session-greeting'
  if (-not $notes.ContainsKey('hello')) { exit 0 }
  $lines = @($notes['hello'])

  $root = $env:CLAUDE_PROJECT_DIR
  if (-not $root -and $payload.cwd -is [string]) { $root = $payload.cwd }
  $seats = $null
  if ($root) { try { $seats = Get-Content -LiteralPath (Join-Path $root 'seats.json') -Raw | ConvertFrom-Json } catch { } }

  if ($seats) {
    $orch = Get-Family $seats.roles.orchestrator.model
    $hardOrch = $null
    if ($seats.PSObject.Properties['awards'] -and $seats.awards.hard.PSObject.Properties['orchestrator']) {
      $hardOrch = Get-Family $seats.awards.hard.orchestrator.model
    }
    $allowed = @($orch, $hardOrch) | Where-Object { $_ }
    $session = Get-Family $payload.model
    if (-not $session) {
      $lines += $notes['unchecked']
    } elseif ($allowed -cnotcontains $session) {
      $shown = if ($hardOrch) { "$orch, or $hardOrch on a hard run" } else { $orch }
      $lines += Fill $notes['model'] @{ model = $payload.model; seats = $shown }
    }
  }

  if ($env:CLAUDE_CODE_EFFORT_LEVEL) { $lines += Fill $notes['env'] @{ name = 'CLAUDE_CODE_EFFORT_LEVEL' } }
  if ($env:CLAUDE_CODE_SUBAGENT_MODEL_FORCE -eq '1') { $lines += Fill $notes['env'] @{ name = 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1' } }

  if ($seats -and $root) {
    $cap = Get-LowestCap $root
    if ($cap -ge 0) {
      # The first seat, roles then hard awards, whose effort is above the cap.
      $found = $null
      $candidates = @($seats.roles.PSObject.Properties | ForEach-Object { @{ label = $_.Name; effort = $_.Value.effort } })
      if ($seats.PSObject.Properties['awards']) {
        $candidates += @($seats.awards.hard.PSObject.Properties | ForEach-Object { @{ label = "$($_.Name) hard"; effort = $_.Value.effort } })
      }
      foreach ($c in $candidates) {
        if (-not $found -and $EFFORTS.IndexOf([string]$c.effort) -gt $cap) { $found = $c }
      }
      if ($found) {
        $lines += Fill $notes['cap'] @{ cap = $EFFORTS[$cap]; role = $found.label; effort = $found.effort }
      }
    }
  }

  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'SessionStart'; additionalContext = ($lines -join ' ') } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
  exit 0
} catch {
  exit 0
}
