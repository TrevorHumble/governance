# edit-gate: a PreToolUse hook on Edit, Write, NotebookEdit, Bash and PowerShell. Until the owner has
# typed /build, /buildlog, /rca, /realign or /resume in this session (unlock-edits then writes
# .run_state/unlocked-<session_id>), it denies every file edit outside the session's scratchpad, the
# memory folders and the plans folder, and every command that is not on the read-only list below.
# The marker is checked before hook-core.ps1 loads, so a broken core never stalls an unlocked run.
# Locked, it fails closed: input that is not JSON and a core that cannot load deny. Empty input, a
# failed read of stdin, input with no tool_input, and an unlocked session allow.
# Not covered: a command on the list that writes in a way the list did not foresee. The list stays
# short to keep that small, and refuses chaining, redirection, substitution and blocks outright.
# Tools outside the five it is wired to, such as an MCP server that runs code, are never seen.
$ErrorActionPreference = 'Stop'

$FALLBACK = 'denied until the owner types /build; see .claude/hooks/notes.md.'
$SAFE_ID = '^[A-Za-z0-9-]+$'

# Program, then the subcommands allowed after it ('*' allows any words). Programs match by bare
# name, ignoring case and a trailing .exe; subcommands match exactly. A program named by a path runs
# only from $PROGRAM_PATHS, since a path into the writable scratchpad could run anything.
$READ_ONLY = @{
  'git'           = @('status', 'log', 'diff', 'show', 'blame', 'ls-files', 'ls-tree', 'rev-parse', 'branch', 'remote', 'worktree')
  'gh'            = @('issue', 'pr', 'api')
  'npm'           = @('test', 'run')
  'npx'           = @('vitest')
  'ls'            = @('*'); 'dir' = @('*'); 'pwd' = @('*'); 'cat' = @('*'); 'head' = @('*')
  'tail'          = @('*'); 'wc' = @('*'); 'grep' = @('*'); 'which' = @('*')
  'get-childitem' = @('*'); 'get-content' = @('*'); 'get-location' = @('*')
  'select-string' = @('*'); 'test-path' = @('*'); 'get-date' = @('*'); 'get-command' = @('*')
}
$PROGRAM_PATHS = @{ 'C:\Program Files\GitHub CLI\gh.exe' = 'gh' }
$CHIRP = 'bash "$HOME/.claude/scripts/alexa-chirp.sh"'
# Words that make a listed command write: an output file, a fix in place, a snapshot update.
$WRITING_WORD = '^(?:--output|--fix|--write|--update|-u$|-o$)'

function Write-Deny([string]$what) {
  $note = $null
  if (Get-Command Get-Note -ErrorAction SilentlyContinue) { $note = Get-Note 'edit-gate' }
  $text = if ($note) { (Fill $note @{ what = $what }) -replace '\s{2,}', ' ' } else { $FALLBACK }
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'PreToolUse'; permissionDecision = 'deny'; permissionDecisionReason = "edit-gate: $text" } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
}

# The second word must be one of these for the listed git, gh and npm commands.
function Test-Subcommand([string]$program, [string[]]$words) {
  $sub = if ($words.Count -gt 1) { $words[1] } else { '' }
  $third = if ($words.Count -gt 2) { $words[2] } else { '' }
  switch ($program) {
    'git' {
      if ($sub -ceq 'branch') { return ($words.Count -eq 2 -or ($words.Count -eq 3 -and $third -cin '--show-current', '-a', '-r', '--list')) }
      # Exact shapes: git takes -v before a subcommand, so "remote -v set-url" must not pass.
      if ($sub -ceq 'remote') { return (($words.Count -eq 3 -and $third -ceq '-v') -or ($words.Count -eq 4 -and $third -ceq 'get-url')) }
      if ($sub -ceq 'worktree') { return ($words.Count -eq 3 -and $third -ceq 'list') }
      return $true
    }
    'gh' {
      if ($sub -ceq 'issue') { return ($third -cin 'view', 'list') }
      if ($sub -ceq 'pr') { return ($third -cin 'view', 'list', 'checks', 'diff', 'status') }
      $rest = if ($words.Count -gt 2) { $words[2..($words.Count - 1)] } else { @() }
      $call = Read-ApiCall $rest
      if ($call.Fields.Count -gt 0 -or $call.Input) { return $false }
      for ($i = 0; $i -lt $rest.Count; $i++) {
        if ($rest[$i] -cmatch '^(?:-X|--method)=?(.*)$') {
          $method = if ($Matches[1]) { $Matches[1] } elseif ($i + 1 -lt $rest.Count) { $rest[$i + 1] } else { '' }
          if ($method -ine 'GET') { return $false }
        }
      }
      return $true
    }
    # No flags at all: npm and vitest flags such as --prefix, --root, --config and -c run code from a
    # folder the model can write. Plain words, such as a test-file filter, pass.
    'npm' {
      if (@($words | Select-Object -Skip 1 | Where-Object { $_.StartsWith('-') }).Count -gt 0) { return $false }
      if ($sub -ceq 'test') { return $true }
      return ($third -cmatch '^(?:test|lint|format:check|check:[\w-]+)$')
    }
    'npx' {
      if (@($words | Select-Object -Skip 1 | Where-Object { $_.StartsWith('-') }).Count -gt 0) { return $false }
      return ($third -ceq 'run')
    }
  }
  return $true
}

function Test-ReadOnly([string]$command) {
  $text = $command.Trim()
  if ($text -ceq $CHIRP) { return $true }
  if ($text -match '[\r\n]') { return $false }
  # A leading PowerShell call operator runs a program by its quoted path; read from after it.
  $from = 0
  $lead = [regex]::Match($text, '^&\s+')
  if ($lead.Success) { $from = $lead.Length }
  $rest = $text.Substring($from)
  if ($rest -match '[;|&<>`(){}]') { return $false }
  $words = Get-SegmentWords $text $from
  if ($words.Count -eq 0) { return $false }
  $first = $words[0]
  if ($first -match '[\\/]') {
    $known = @($PROGRAM_PATHS.Keys | Where-Object { $_ -ieq $first })
    if ($known.Count -eq 0) { return $false }
    $program = $PROGRAM_PATHS[$known[0]]
  } else {
    $program = $first.ToLowerInvariant() -replace '\.exe$', ''
  }
  if (-not $READ_ONLY.ContainsKey($program)) { return $false }
  if (@($words | Where-Object { $_ -match $WRITING_WORD }).Count -gt 0) { return $false }
  $subs = $READ_ONLY[$program]
  if ($subs -notcontains '*') {
    if ($words.Count -lt 2 -or $subs -cnotcontains $words[1]) { return $false }
  }
  return (Test-Subcommand $program $words)
}

# A path inside $dir, after both are made full. Windows compares without case.
function Test-Inside([string]$path, [string]$dir) {
  if (-not $dir) { return $false }
  $sep = [System.IO.Path]::DirectorySeparatorChar
  $d = [System.IO.Path]::GetFullPath($dir).TrimEnd('\', '/') + $sep
  return $path.StartsWith($d, [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-FreePath([string]$target, $payload) {
  $p = $target -replace '^~(?=[/\\]|$)', $HOME
  if (-not [System.IO.Path]::IsPathRooted($p) -and $payload.cwd -is [string]) { $p = Join-Path $payload.cwd $p }
  $full = [System.IO.Path]::GetFullPath($p)
  if ($payload.scratchpad_dir -is [string] -and (Test-Inside $full $payload.scratchpad_dir)) { return $true }
  # Without scratchpad_dir, the session's own scratchpad by its usual shape:
  # <temp>/claude/<project>/<session_id>/scratchpad/.
  $id = $payload.session_id
  $tempClaude = Join-Path ([System.IO.Path]::GetTempPath()) 'claude'
  if ($id -is [string] -and $id -cmatch $SAFE_ID -and (Test-Inside $full $tempClaude)) {
    $parts = $full.Substring([System.IO.Path]::GetFullPath($tempClaude).TrimEnd('\', '/').Length + 1) -split '[\\/]'
    if ($parts.Count -ge 4 -and $parts[1] -ceq $id -and $parts[2] -ieq 'scratchpad') { return $true }
  }
  $claude = Join-Path $HOME '.claude'
  if (Test-Inside $full (Join-Path $claude 'plans')) { return $true }
  $projects = Join-Path $claude 'projects'
  if (Test-Inside $full $projects) {
    $parts = $full.Substring([System.IO.Path]::GetFullPath($projects).TrimEnd('\', '/').Length + 1) -split '[\\/]'
    return ($parts.Count -ge 3 -and $parts[1] -ieq 'memory')
  }
  return $false
}

try {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $raw = $reader.ReadToEnd()
} catch { exit 0 }
if ($raw.Trim() -eq '') { exit 0 }
try { $payload = $raw | ConvertFrom-Json } catch { Write-Deny 'Its input could not be read.'; exit 0 }
if ($null -eq $payload -or $null -eq $payload.tool_input) { exit 0 }

# Unlocked: decided before anything that could fail.
try {
  $root = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } elseif ($payload.cwd -is [string]) { $payload.cwd } else { $null }
  $id = $payload.session_id
  if ($root -and $id -is [string] -and $id -cmatch $SAFE_ID -and
    (Test-Path -LiteralPath (Join-Path $root ".run_state/unlocked-$id") -PathType Leaf)) { exit 0 }
} catch { }

try { . (Join-Path $PSScriptRoot 'hook-core.ps1') } catch { Write-Deny ''; exit 0 }

try {
  $tool = $payload.tool_name
  $in = $payload.tool_input
  if ($tool -cin 'Edit', 'Write', 'NotebookEdit') {
    $target = if ($in.file_path -is [string]) { $in.file_path } else { $in.notebook_path }
    if ($target -isnot [string] -or $target -eq '') { Write-Deny 'It names no file.'; exit 0 }
    if (-not (Test-FreePath $target $payload)) { Write-Deny "It edits $target." }
    exit 0
  }
  if ($tool -cin 'Bash', 'PowerShell') {
    $command = $in.command
    if ($command -isnot [string]) { Write-Deny 'It has no command.'; exit 0 }
    if (-not (Test-ReadOnly $command)) { Write-Deny 'Its command is not on the read-only list.' }
    exit 0
  }
  exit 0
} catch {
  Write-Deny ''
  exit 0
}
