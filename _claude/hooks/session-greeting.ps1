# session-greeting: a SessionStart hook. It adds a greeting the model reads before the first prompt,
# plus warnings when something would override the seats in seats.json:
#   - the session's model is neither the orchestrator seat nor its hard award (checked only when the
#     input carries `model`; after /clear or a recovery it does not, and the greeting says so);
#   - CLAUDE_CODE_EFFORT_LEVEL is set, or CLAUDE_CODE_SUBAGENT_MODEL_FORCE is 1;
#   - a maxEffortLevel in settings is below a seat's effort;
#   - .run_state/hard exists at the project root (a leftover marker would move later runs up).
# The project root is CLAUDE_PROJECT_DIR, else the input's cwd. It never blocks. Unreadable input
# prints nothing; a seats.json that is missing or odd drops only the checks that need it, and the
# hello line always prints.
$ErrorActionPreference = 'Stop'

$EFFORTS = @('low', 'medium', 'high', 'xhigh', 'max')

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
  . (Join-Path $PSScriptRoot 'hook-core.ps1')
  $payload = (Read-Stdin) | ConvertFrom-Json
  if ($null -eq $payload) { exit 0 }
  $hello = Get-Note 'session-greeting' 'hello'
  if (-not $hello) { exit 0 }
  $lines = @($hello)
  $root = Get-ProjectRoot $payload
  $seats = Read-Seats $root

  # Each check stands alone: one that throws on an odd seats.json drops only itself.
  try {
    if ($seats) {
      $orch = Get-Family $seats.roles.orchestrator.model
      $hardOrch = $null
      $hardAwards = Get-HardAwards $seats
      if ($hardAwards -and $hardAwards.PSObject.Properties['orchestrator']) {
        $hardOrch = Get-Family $hardAwards.orchestrator.model
      }
      $allowed = @($orch, $hardOrch) | Where-Object { $_ }
      $session = Get-Family $payload.model
      if (-not $orch) {
        # No orchestrator seat to compare with.
      } elseif (-not $session) {
        $lines += Get-Note 'session-greeting' 'unchecked'
      } elseif ($allowed -cnotcontains $session) {
        $shown = if ($hardOrch) { "$orch, or $hardOrch on a hard run" } else { $orch }
        $lines += Fill (Get-Note 'session-greeting' 'model') @{ model = $payload.model; seats = $shown }
      }
    }
  } catch { }

  if ($env:CLAUDE_CODE_EFFORT_LEVEL) { $lines += Fill (Get-Note 'session-greeting' 'env') @{ name = 'CLAUDE_CODE_EFFORT_LEVEL' } }
  if ($env:CLAUDE_CODE_SUBAGENT_MODEL_FORCE -eq '1') { $lines += Fill (Get-Note 'session-greeting' 'env') @{ name = 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1' } }

  try {
    if ($seats -and $root) {
      $cap = Get-LowestCap $root
      if ($cap -ge 0) {
        # The first seat, roles then hard awards, whose effort is above the cap.
        $candidates = @($seats.roles.PSObject.Properties | ForEach-Object { @{ label = $_.Name; effort = $_.Value.effort } })
        $hardAwards = Get-HardAwards $seats
        if ($hardAwards) {
          $candidates += @($hardAwards.PSObject.Properties | ForEach-Object { @{ label = "$($_.Name) hard"; effort = $_.Value.effort } })
        }
        $found = $null
        foreach ($c in $candidates) {
          if (-not $found -and $EFFORTS.IndexOf([string]$c.effort) -gt $cap) { $found = $c }
        }
        if ($found) {
          $lines += Fill (Get-Note 'session-greeting' 'cap') @{ cap = $EFFORTS[$cap]; role = $found.label; effort = $found.effort }
        }
      }
    }
  } catch { }

  try {
    if ($root -and (Test-Path -LiteralPath (Join-Path $root '.run_state/hard') -PathType Leaf)) {
      $lines += Get-Note 'session-greeting' 'marker'
    }
  } catch { }

  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'SessionStart'; additionalContext = (@($lines | Where-Object { $_ }) -join ' ') } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
  exit 0
} catch {
  exit 0
}
