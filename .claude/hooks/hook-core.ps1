# hook-core: the logic the hooks in this folder share, dot-sourced by each of them. It holds
# reading stdin, reading a section (and a key) from notes.md, filling placeholders, the model family
# word, the project root, the role tag, reading seats.json, and splitting a command into words and a
# gh api call into its parts. A hook that cannot load this file
# does nothing (or, for a deny, falls back to its one generic line); it never crashes the session.
$HOOK_DIR = $PSScriptRoot
$ROLE_TAG = '^\s*\[([a-z][a-z0-9-]*)(?:\s+(hard))?\]'

function Read-Stdin {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  return $reader.ReadToEnd()
}

# The text under "## <hook>" in notes.md on one line, or with $key the text after "<key>: " on that
# section's line. $null when the file, the section, or the key is missing.
function Get-Note([string]$hook, [string]$key = '') {
  try {
    $text = [System.IO.File]::ReadAllText((Join-Path $HOOK_DIR 'notes.md'))
    $m = [regex]::Match($text, '(?ms)^## ' + [regex]::Escape($hook) + '[ \t]*\r?\n(.*?)(?=^## |\z)')
    if (-not $m.Success) { return $null }
    $body = $m.Groups[1].Value.Trim()
    if ($key -eq '') { return ($body -replace '\s*\r?\n\s*', ' ') }
    $kv = [regex]::Match($body, '(?m)^' + [regex]::Escape($key) + ': (.*?)\s*$')
    if ($kv.Success) { return $kv.Groups[1].Value }
    return $null
  } catch { return $null }
}

# One pass over the text: a value that itself holds {key} is not filled again. An unknown {key} stays.
function Fill([string]$text, [hashtable]$values) {
  $eval = [System.Text.RegularExpressions.MatchEvaluator]{
    param($m)
    $k = $m.Groups[1].Value
    if ($values.ContainsKey($k)) { [string]$values[$k] } else { $m.Value }
  }.GetNewClosure()
  return [regex]::Replace($text, '\{([A-Za-z]+)\}', $eval)
}

# The family word of a model ID: the word after "claude-" anywhere in it (so
# us.anthropic.claude-sonnet-5-5-v1:0 gives sonnet), else the ID itself, lower-cased, without a
# [1m]-style suffix (so a short alias such as sonnet stays sonnet).
function Get-Family($id) {
  if ($id -isnot [string]) { return $null }
  $s = ($id.ToLowerInvariant() -replace '\[.*$', '').Trim()
  $m = [regex]::Match($s, 'claude-([a-z]+)')
  if ($m.Success) { return $m.Groups[1].Value }
  return $s
}

# CLAUDE_PROJECT_DIR, else the input's cwd, else $null.
function Get-ProjectRoot($payload) {
  if ($env:CLAUDE_PROJECT_DIR) { return $env:CLAUDE_PROJECT_DIR }
  if ($null -ne $payload -and $payload.cwd -is [string] -and $payload.cwd -ne '') { return $payload.cwd }
  return $null
}

# @{ Role = 'x'; Hard = $true/$false } from the tag that starts a description, else $null.
function Get-RoleTag($description) {
  if ($description -isnot [string]) { return $null }
  $m = [regex]::Match($description, $ROLE_TAG)
  if (-not $m.Success) { return $null }
  return @{ Role = $m.Groups[1].Value; Hard = $m.Groups[2].Success }
}

# The parsed seats.json under the root, or $null when it cannot be read.
function Read-Seats($root) {
  if (-not $root) { return $null }
  try { return (Get-Content -LiteralPath (Join-Path $root 'seats.json') -Raw | ConvertFrom-Json) } catch { return $null }
}

# The "hard" awards object, or $null when seats.json has no awards or no hard entry.
function Get-HardAwards($seats) {
  if ($null -eq $seats -or -not $seats.PSObject.Properties['awards']) { return $null }
  $awards = $seats.awards
  if ($null -eq $awards -or -not $awards.PSObject.Properties['hard']) { return $null }
  return $awards.hard
}

# The words after $from up to the next unquoted ; | & or newline, and (unless $wide) also a ) or a
# backtick, which usually end a substitution. $wide reads past those, to see a call whose endpoint is
# itself a substitution.
function Get-SegmentWords([string]$text, [int]$from, [bool]$wide = $false) {
  $quote = ''
  $i = $from
  for (; $i -lt $text.Length; $i++) {
    $c = [string]$text[$i]
    if ($quote) {
      if ($c -eq '\' -and $quote -eq '"') { $i++ } elseif ($c -eq $quote) { $quote = '' }
    } elseif ($c -eq '\') {
      $i++
    } elseif ($c -eq '"' -or $c -eq "'") {
      $quote = $c
    } elseif ($c -in ';', '|', '&', "`n") {
      break
    } elseif (-not $wide -and $c -in ')', '`') {
      break
    }
  }
  $segment = $text.Substring($from, [Math]::Min($i, $text.Length) - $from)
  $words = [regex]::Matches($segment, '(?:\\.|"[^"]*"|''[^'']*''|[^\s"''\\])+')
  # The leading comma keeps a one-word result an array; PowerShell would unroll it to a string.
  return , @($words | ForEach-Object { $_.Value -replace '\\(["''])', '$1' -replace '["'']', '' })
}

# Flags of gh api that take a value, so a word after one is not read as a field flag.
$API_VALUE_FLAGS = @('-H', '--header', '-q', '--jq', '-t', '--template', '--hostname', '--cache',
  '-p', '--preview', '-X', '--method')

# Splits the words of one gh api call into its positional words (the endpoint), its field words
# (-f, -F, --field, --raw-field, each with the raw text after the flag), and whether it has --input.
function Read-ApiCall([string[]]$words) {
  $call = @{ Positionals = @(); Fields = @(); Input = $false }
  for ($i = 0; $i -lt $words.Count; $i++) {
    $w = $words[$i]
    if ($w -ceq '--') { if ($i + 1 -lt $words.Count) { $call.Positionals += $words[($i + 1)..($words.Count - 1)] }; break }
    $name = $null; $val = $null
    if ($w.StartsWith('--')) { $name, $val = $w -split '=', 2 }
    elseif ($w -cmatch '^-[A-Za-z]') {
      $name = $w.Substring(0, 2)
      if ($w.Length -gt 2) { $val = $w.Substring(2); if ($val.StartsWith('=')) { $val = $val.Substring(1) } }
    } else { $call.Positionals += $w; continue }
    if ($name -ceq '--input') { $call.Input = $true; if ($null -eq $val) { $i++ }; continue }
    if ($API_VALUE_FLAGS -ccontains $name) { if ($null -eq $val) { $i++ }; continue }
    if ($name -cnotin '-f', '-F', '--field', '--raw-field') { continue }
    if ($null -eq $val) { $val = if ($i + 1 -lt $words.Count) { $words[++$i] } else { '' } }
    $call.Fields += , @{ Typed = ($name -ceq '-F' -or $name -ceq '--field'); Text = $val }
  }
  return $call
}

# The roles whose agent is "reviewer", read from seats.json (no list kept here).
function Get-ReviewerRoles($seats) {
  if ($null -eq $seats -or $null -eq $seats.roles) { return @() }
  return @($seats.roles.PSObject.Properties | Where-Object { $_.Value.agent -ceq 'reviewer' } | ForEach-Object { $_.Name })
}
