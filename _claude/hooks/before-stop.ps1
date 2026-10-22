# before-stop: a Stop hook. It adds a note the model reads before it ends its turn. It never blocks.
# The note continues the conversation once; when Claude Code is already continuing because of a stop
# hook (stop_hook_active), it prints nothing, so the session can end. Any problem prints nothing.
$ErrorActionPreference = 'Stop'

function Get-Note([string]$hook) {
  $text = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'notes.md'))
  $m = [regex]::Match($text, '(?ms)^## ' + [regex]::Escape($hook) + '[ \t]*\r?\n(.*?)(?=^## |\z)')
  if (-not $m.Success) { return $null }
  return ($m.Groups[1].Value.Trim() -replace '\s*\r?\n\s*', ' ')
}

try {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $payload = $reader.ReadToEnd() | ConvertFrom-Json
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
