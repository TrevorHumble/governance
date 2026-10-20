# before-issue-create: a PreToolUse hook for Bash calls. It denies filing a GitHub issue unless the
# call is `gh issue create` with the needs-issue-review label and --body-file <file> (or -F <file>)
# whose first line is "Owner-approved: yes". Every other way of creating one is denied with a
# message naming that form. It is a reminder, not a guarantee: an agent can type the line.
# `gh` counts only where a command can start. Single-quoted text, quoted heredoc bodies, and
# double-quoted text outside $( ) are not scanned, so grep, rg, and commit messages that mention
# the command pass.
# Not covered: bash -c and pwsh -c strings, a cd earlier in the same command, gh api graphql, line
# continuations inside the command, a loop that runs one create several times, and a line starting
# with `gh issue create` inside an unquoted heredoc (it looks like a command).
# Any failure here allows the call.
$ErrorActionPreference = 'Stop'

$LABEL = 'needs-issue-review'
$FIRST_LINE = 'Owner-approved: yes'
$MAX_READ = 1MB

# The program name ignores case because Windows resolves GH and Gh.exe; verbs and flags do not.
$PROGRAM = '(?:"(?:[^"]*[\\/])?(?i:gh(?:\.exe)?)"|''(?:[^'']*[\\/])?(?i:gh(?:\.exe)?)''|(?:[^\s"''`;&|()]*[\\/])?(?i:gh(?:\.exe)?))'
$PREFIX = '(?:env|command|sudo|time|exec|nohup|nice|xargs|then|do|else|if|while|until|!|\{|timeout\s+[\d.]+[smhd]?|[A-Za-z_]\w*=(?:"[^"]*"|''[^'']*''|\S*))'
$COMMAND_START = '(?:^|[;|&\n(`])\s*(?:&\s*)?(?:' + $PREFIX + '\s+)*' + $PROGRAM
$CREATE = $COMMAND_START + '\s+issue\s+(?:(?:-R|--repo)(?:=|\s+)(?:"[^"]*"|\S+)\s+)?(?:create|new)(?=[\s;|&)`]|$)'
$API = $COMMAND_START + '\s+api(?=\s)'
$ISSUES_ENDPOINT = '^(?:https?://[^/]+(?:/api/v3)?)?/?repos/[^/]+/[^/]+/issues/?(?:\?.*)?$'

# Flags that take a value. Reading them by name keeps a title like "drop the -b flag" from counting.
$VALUE_FLAGS = @('--body', '-b', '--body-file', '-F', '--label', '-l', '--title', '-t', '--assignee', '-a',
  '--milestone', '-m', '--project', '-p', '--repo', '-R', '--template', '-T', '--recover')

function Get-ScanText([string]$text) {
  # Same length as $text, so a match position indexes the original. Masks what is not a command:
  # quoted heredoc bodies, single-quoted text, and double-quoted text outside $( ).
  $text = [regex]::Replace($text, '(<<-?[ \t]*([''"])(\w+)\2[^\n]*)\n.*?\n[ \t]*\3[ \t\r]*(?=\n|$)',
    [System.Text.RegularExpressions.MatchEvaluator] { param($m)
      $m.Groups[1].Value + [regex]::Replace($m.Value.Substring($m.Groups[1].Length), '[^\n]', 'x') },
    [System.Text.RegularExpressions.RegexOptions]::Singleline)
  $out = New-Object System.Text.StringBuilder
  $stack = New-Object System.Collections.Generic.List[string]
  $inSingle = $false
  for ($i = 0; $i -lt $text.Length; $i++) {
    $c = [string]$text[$i]
    $next = if ($i + 1 -lt $text.Length) { [string]$text[$i + 1] } else { '' }
    $top = if ($stack.Count) { $stack[$stack.Count - 1] } else { 'code' }
    if ($inSingle) {
      if ($c -eq "'") { $inSingle = $false; [void]$out.Append($c) } else { [void]$out.Append('x') }
    } elseif ($c -eq '\' -and ($top -ne 'dq' -or $next -in '"', '\', '$', '`')) {
      # In double quotes only these four are escapes; a Windows path like "C:\Program Files\gh.exe" keeps its slashes.
      [void]$out.Append($(if ($top -eq 'dq') { 'x' } else { $c }))
      if ($next) { [void]$out.Append($(if ($top -eq 'dq') { 'x' } else { $next })); $i++ }
    } elseif ($top -eq 'dq') {
      if ($c -eq '"') { $stack.RemoveAt($stack.Count - 1); [void]$out.Append($c) }
      elseif ($c -eq '$' -and $next -eq '(') { $stack.Add('sub'); [void]$out.Append('$('); $i++ }
      elseif ($c -in ';', '|', '&', '(', "`n") { [void]$out.Append('x') }
      else { [void]$out.Append($c) }
    } else {
      if ($c -eq "'") { $inSingle = $true }
      elseif ($c -eq '"') { $stack.Add('dq') }
      elseif ($c -eq '(') { $stack.Add('sub') }
      elseif ($c -eq ')' -and $stack.Count) { $stack.RemoveAt($stack.Count - 1) }
      [void]$out.Append($c)
    }
  }
  return $out.ToString()
}

function Get-SegmentWords([string]$text, [int]$from) {
  $quote = ''
  $i = $from
  for (; $i -lt $text.Length; $i++) {
    $c = [string]$text[$i]
    if ($quote) {
      if ($c -eq '\' -and $quote -eq '"') { $i++ } elseif ($c -eq $quote) { $quote = '' }
    } elseif ($c -eq '"' -or $c -eq "'") {
      $quote = $c
    } elseif ($c -in ';', '|', '&', "`n", ')', '`') {
      break
    }
  }
  $segment = $text.Substring($from, [Math]::Min($i, $text.Length) - $from)
  $words = [regex]::Matches($segment, '(?:"[^"]*"|''[^'']*''|[^\s"''])+')
  # The leading comma keeps a one-word result an array; PowerShell would unroll it to a string.
  return , @($words | ForEach-Object { $_.Value -replace '["'']', '' })
}

function Get-CreateFacts([string[]]$words) {
  $facts = @{ Inline = $false; Labels = @(); File = $null }
  for ($i = 0; $i -lt $words.Count; $i++) {
    $w = $words[$i]
    if ($w -ceq '--') { break }
    if ($w.StartsWith('--')) { $name, $val = $w -split '=', 2 }
    elseif ($w -cmatch '^-[A-Za-z]') { $name = $w.Substring(0, 2); $val = $w.Substring(2).TrimStart('=') }
    else { continue }
    if ($VALUE_FLAGS -cnotcontains $name) { continue }
    if (-not $val) { $val = if ($i + 1 -lt $words.Count) { $words[++$i] } else { '' } }
    if ($name -ceq '--body' -or $name -ceq '-b') { $facts.Inline = $true }
    elseif ($name -ceq '--label' -or $name -ceq '-l') { $facts.Labels += $val -split ',' | ForEach-Object { $_.Trim() } }
    elseif ($name -ceq '--body-file' -or $name -ceq '-F') { $facts.File = $val }
  }
  return $facts
}

function Test-ApiPost([string[]]$words) {
  # A POST to exactly repos/<owner>/<repo>/issues. Fields with no explicit method also POST.
  if (-not ($words | Where-Object { $_ -match $ISSUES_ENDPOINT })) { return $false }
  $method = $null
  $hasFields = $false
  for ($i = 0; $i -lt $words.Count; $i++) {
    $w = $words[$i]
    if ($w -cmatch '^(?:-X|--method=?)(.*)$') { $method = if ($Matches[1]) { $Matches[1] } else { $words[++$i] } }
    elseif ($w -cmatch '^(?:-[fF]|--field|--raw-field|--input)') { $hasFields = $true }
  }
  if ($method) { return $method -ieq 'POST' }
  return $hasFields
}

function Write-Deny($why) {
  $reason = "before-issue-create: this call files an issue, but $why. File an issue one way: " +
    "gh issue create --label $LABEL --body-file <file>, where the file's first line is '$FIRST_LINE'. " +
    "The owner's yes comes first: send the hand-off (pipeline/steps/05-hand-off.md) and wait for it."
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'PreToolUse'; permissionDecision = 'deny'; permissionDecisionReason = $reason } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
}

try {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $payload = $reader.ReadToEnd() | ConvertFrom-Json
  $text = $payload.tool_input.command
  if ($text -isnot [string]) { exit 0 }

  # Matching is case-sensitive: the verb and flag names must be exact. Only the program name ignores case.
  $scan = Get-ScanText $text
  $creates = @([regex]::Matches($scan, $CREATE))
  $apiPosts = @([regex]::Matches($scan, $API) | Where-Object { Test-ApiPost (Get-SegmentWords $text ($_.Index + $_.Length)) })
  if ($creates.Count + $apiPosts.Count -eq 0) { exit 0 }
  if ($creates.Count + $apiPosts.Count -gt 1) { Write-Deny 'it files more than one issue (file one issue per call)'; exit 0 }
  if ($apiPosts.Count -eq 1) { Write-Deny 'it creates the issue through gh api'; exit 0 }

  $facts = Get-CreateFacts (Get-SegmentWords $text ($creates[0].Index + $creates[0].Length))
  if ($facts.Inline) { Write-Deny 'its body is inline'; exit 0 }
  if ($facts.Labels -cnotcontains $LABEL) { Write-Deny "it has no $LABEL label"; exit 0 }
  if (-not $facts.File -or $facts.File -eq '-') { Write-Deny 'its body does not come from a file (stdin cannot be read here)'; exit 0 }

  $path = $facts.File -replace '^~(?=[/\\]|$)', $HOME
  if (-not [System.IO.Path]::IsPathRooted($path) -and $payload.cwd -is [string]) { $path = Join-Path $payload.cwd $path }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Deny "the body file '$($facts.File)' is missing or is a directory"; exit 0 }

  # Only the first line matters, so a huge file is read no further than $MAX_READ.
  $stream = [System.IO.File]::OpenRead($path)
  try {
    $buffer = New-Object byte[] $MAX_READ
    $count = $stream.Read($buffer, 0, $buffer.Length)
  } finally { $stream.Dispose() }
  $head = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $count).TrimStart([char]0xFEFF)
  if (($head -split "`n", 2)[0].TrimEnd("`r") -cne $FIRST_LINE) {
    Write-Deny "the first line of '$($facts.File)' is not '$FIRST_LINE'"
  }
  exit 0
} catch {
  exit 0
}
