# goal-check: a PreToolUse hook on AskUserQuestion. It adds a note the model reads next to the tool
# result, which lands after the owner has answered. It sets no permission decision, so the normal
# permission flow runs, and it never blocks. Any problem with the input or notes.md prints nothing.
$ErrorActionPreference = 'Stop'

try {
  . (Join-Path $PSScriptRoot 'hook-core.ps1')
  $payload = (Read-Stdin) | ConvertFrom-Json
  if ($null -eq $payload) { exit 0 }
  $note = Get-Note 'goal-check'
  if (-not $note) { exit 0 }
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{ hookEventName = 'PreToolUse'; additionalContext = $note } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
  exit 0
} catch {
  exit 0
}
