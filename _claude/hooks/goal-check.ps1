# goal-check: a PreToolUse hook on AskUserQuestion. It allows the question and adds a note the model
# reads next to the tool result. It never blocks. Any problem with the input or notes.md prints
# nothing and allows the call.
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
  $note = Get-Note 'goal-check'
  if (-not $note) { exit 0 }
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'PreToolUse'; permissionDecision = 'allow'; additionalContext = $note } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
  exit 0
} catch {
  exit 0
}
