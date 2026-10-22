# reviewer-done: a PostToolUse hook on Agent. When an agent whose description starts with a reviewer
# role tag ([issue-reviewer], [code-reviewer], [referee], each optionally "hard") returns, it adds a
# note the model reads next to the result. It never blocks. A background launch has not returned yet,
# so it gets no note. Any problem prints nothing.
$ErrorActionPreference = 'Stop'

$REVIEWERS = @('issue-reviewer', 'code-reviewer', 'referee')

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
  $desc = $payload.tool_input.description
  if ($desc -isnot [string]) { exit 0 }
  $tag = [regex]::Match($desc, '^\s*\[([a-z][a-z0-9-]*)(?:\s+hard)?\]')
  if (-not $tag.Success -or $REVIEWERS -cnotcontains $tag.Groups[1].Value) { exit 0 }
  if ("$($payload.tool_response.status)" -eq 'async_launched') { exit 0 }
  $note = Get-Note 'reviewer-done'
  if (-not $note) { exit 0 }
  $note = $note.Replace('{role}', $tag.Groups[1].Value)
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{ hookEventName = 'PostToolUse'; additionalContext = $note } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
  exit 0
} catch {
  exit 0
}
