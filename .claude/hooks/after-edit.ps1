# after-edit: a PostToolUse hook on Edit and Write. When the edited file is one of the paths in
# repo-profile.json's docCurrencyPaths (an exact path, a folder, or a pattern with *), it adds a note
# the model reads next to the result. An empty list means no note. It never blocks.
# The profile is read from the project root (CLAUDE_PROJECT_DIR, else the input's cwd). The edited
# path is made relative to the longest of the project root and the input's cwd that contains it, so a
# worktree under the root (cwd) matches the same entries as the root does.
# Not covered: an edit made by Bash or another process, which fires no Edit or Write hook.
# Any problem prints nothing.
$ErrorActionPreference = 'Stop'

function Get-Relative([string]$file, [string]$root) {
  if (-not $root) { return $null }
  $r = ($root -replace '\\', '/').TrimEnd('/') + '/'
  if ($file.StartsWith($r, [System.StringComparison]::OrdinalIgnoreCase)) {
    return @{ Rel = $file.Substring($r.Length); Length = $r.Length }
  }
  return $null
}

try {
  . (Join-Path $PSScriptRoot 'hook-core.ps1')
  $payload = (Read-Stdin) | ConvertFrom-Json
  if ($null -eq $payload) { exit 0 }
  $file = $payload.tool_input.file_path
  if ($file -isnot [string] -or $file -eq '') { exit 0 }
  $file = $file -replace '\\', '/'

  $root = Get-ProjectRoot $payload
  if (-not $root) { exit 0 }
  $profile = Get-Content -LiteralPath (Join-Path $root 'repo-profile.json') -Raw | ConvertFrom-Json
  $paths = @($profile.docCurrencyPaths | Where-Object { $_ -is [string] -and $_ -ne '' })
  if ($paths.Count -eq 0) { exit 0 }

  $found = $null
  foreach ($candidate in @($root, $payload.cwd)) {
    if ($candidate -isnot [string]) { continue }
    $hit = Get-Relative $file $candidate
    if ($hit -and (-not $found -or $hit.Length -gt $found.Length)) { $found = $hit }
  }
  if (-not $found) { exit 0 }
  $rel = $found.Rel

  $matched = $false
  foreach ($p in $paths) {
    $entry = (($p -replace '\\', '/') -replace '^\./', '').TrimEnd('/')
    if ($entry -eq '') { continue }
    if ($entry.Contains('*')) { if ($rel -like $entry) { $matched = $true } }
    elseif ($rel -ieq $entry -or $rel.StartsWith("$entry/", [System.StringComparison]::OrdinalIgnoreCase)) { $matched = $true }
  }
  if (-not $matched) { exit 0 }

  $note = Get-Note 'after-edit'
  if (-not $note) { exit 0 }
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'PostToolUse'; additionalContext = (Fill $note @{ path = $rel }) } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
  exit 0
} catch {
  exit 0
}
