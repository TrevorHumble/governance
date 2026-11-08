# before-reply: a UserPromptSubmit hook. It adds a note the model reads before it writes its reply.
# It never blocks. A note added at Stop would come back as a new turn and draw a second reply, so the
# note is added here, before the reply. Any problem prints nothing.
$ErrorActionPreference = 'Stop'

try {
  . (Join-Path $PSScriptRoot 'hook-core.ps1')
  $payload = (Read-Stdin) | ConvertFrom-Json
  if ($null -eq $payload) { exit 0 }
  $note = Get-Note 'before-reply'
  if (-not $note) { exit 0 }
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{ hookEventName = 'UserPromptSubmit'; additionalContext = $note } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
  exit 0
} catch {
  exit 0
}
