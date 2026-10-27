# before-stop: a Stop hook. It adds a note the model reads before it ends its turn. It never blocks.
# The note continues the conversation once; when Claude Code is already continuing because of a stop
# hook (stop_hook_active), it prints nothing, so the session can end. Any problem prints nothing.
$ErrorActionPreference = 'Stop'

try {
  . (Join-Path $PSScriptRoot 'hook-core.ps1')
  $payload = (Read-Stdin) | ConvertFrom-Json
  if ($null -eq $payload) { exit 0 }
  # Anything but a plain false counts as active: a note that cannot end the session is worse than none.
  if ("$($payload.stop_hook_active)" -ne '' -and "$($payload.stop_hook_active)" -ne 'False') { exit 0 }
  $note = Get-Note 'before-stop'
  if (-not $note) { exit 0 }
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{ hookEventName = 'Stop'; additionalContext = $note } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
  exit 0
} catch {
  exit 0
}
