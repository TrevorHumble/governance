# unlock-edits: a UserPromptExpansion hook. When the owner types /build, /buildlog, /rca, /realign or
# /resume, it writes .run_state/unlocked-<session_id> under the project root, and edit-gate then lets
# that session edit. Claude Code fires this event only for a command the user types, never for the
# model's own Skill call, so the model cannot unlock itself.
# It never blocks the command and prints nothing. It writes nothing for another command, for an
# expansion that is not a slash command, or for a session id outside [A-Za-z0-9-].
# Like edit-gate's marker check, it does not load hook-core.ps1, so a broken core cannot stop the
# owner from unlocking. The settings.json matcher must name the same five; a test checks it.
$ErrorActionPreference = 'Stop'

$UNLOCKING = @('build', 'buildlog', 'rca', 'realign', 'resume')

try {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $raw = $reader.ReadToEnd()
  if ($raw.Trim() -eq '') { exit 0 }
  $payload = $raw | ConvertFrom-Json
  if ($payload.expansion_type -cne 'slash_command') { exit 0 }
  if ($UNLOCKING -cnotcontains $payload.command_name) { exit 0 }
  $id = $payload.session_id
  if ($id -isnot [string] -or $id -cnotmatch '^[A-Za-z0-9-]+$') { exit 0 }
  $root = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } elseif ($payload.cwd -is [string]) { $payload.cwd } else { $null }
  if (-not $root) { exit 0 }
  $dir = Join-Path $root '.run_state'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Set-Content -LiteralPath (Join-Path $dir "unlocked-$id") -Value $payload.command_name -Encoding ascii
  exit 0
} catch {
  exit 0
}
