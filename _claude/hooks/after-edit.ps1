# after-edit: a PostToolUse hook on Edit and Write. When the edited file is one of the paths in
# repo-profile.json's docCurrencyPaths (an exact path, a folder, or a pattern with *), it adds a note
# the model reads next to the result. An empty list means no note. It never blocks. The project root
# is CLAUDE_PROJECT_DIR, else the input's cwd. Any problem prints nothing.
$ErrorActionPreference = 'Stop'

function Get-Note([string]$hook) {
  $text = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'notes.md'))
  $m = [regex]::Match($text, '(?ms)^## ' + [regex]::Escape($hook) + '[ \t]*\r?\n(.*?)(?=^## |\z)')
  if (-not $m.Success) { return $null }
  return ($m.Groups[1].Value.Trim() -replace '\s*\r?\n\s*', ' ')
}

function Get-Relative([string]$file, [string]$root) {
  if (-not $root) { return $null }
  $r = ($root -replace '\\', '/').TrimEnd('/') + '/'
  if ($file.StartsWith($r, [System.StringComparison]::OrdinalIgnoreCase)) { return $file.Substring($r.Length) }
  return $null
}

try {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $payload = $reader.ReadToEnd() | ConvertFrom-Json
  if ($null -eq $payload) { exit 0 }
  $file = $payload.tool_input.file_path
  if ($file -isnot [string] -or $file -eq '') { exit 0 }
  $file = $file -replace '\\', '/'

  $root = $env:CLAUDE_PROJECT_DIR
  if (-not $root -and $payload.cwd -is [string]) { $root = $payload.cwd }
  if (-not $root) { exit 0 }
  $profile = Get-Content -LiteralPath (Join-Path $root 'repo-profile.json') -Raw | ConvertFrom-Json
  $paths = @($profile.docCurrencyPaths | Where-Object { $_ -is [string] -and $_ -ne '' })
  if ($paths.Count -eq 0) { exit 0 }

  # The edit may sit in a worktree under another root, so try the project root, then the cwd.
  $rel = Get-Relative $file $root
  if (-not $rel -and $payload.cwd -is [string]) { $rel = Get-Relative $file $payload.cwd }
  if (-not $rel) { exit 0 }

  $hit = $false
  foreach ($p in $paths) {
    $entry = (($p -replace '\\', '/') -replace '^\./', '').TrimEnd('/')
    if ($entry -eq '') { continue }
    if ($entry.Contains('*')) { if ($rel -like $entry) { $hit = $true } }
    elseif ($rel -ieq $entry -or $rel.StartsWith("$entry/", [System.StringComparison]::OrdinalIgnoreCase)) { $hit = $true }
  }
  if (-not $hit) { exit 0 }

  $note = Get-Note 'after-edit'
  if (-not $note) { exit 0 }
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'PostToolUse'; additionalContext = $note.Replace('{path}', $rel) } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
  exit 0
} catch {
  exit 0
}
