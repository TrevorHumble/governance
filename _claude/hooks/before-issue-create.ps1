# before-issue-create: a PreToolUse hook for Bash calls. It denies filing a GitHub issue unless the
# call is `gh issue create` with the needs-issue-review label and --body-file <file> (or -F <file>)
# whose first line is "Owner-approved: yes". Every other way of creating one is denied with a
# message naming that form. It is a reminder, not a guarantee: an agent can type the line.
# Not covered: bash -c strings, a cd earlier in the same command, gh api graphql, and a heredoc
# line that starts with `gh issue create` (it looks like a command). Any failure here allows the call.
$ErrorActionPreference = 'Stop'

$LABEL = 'needs-issue-review'
$FIRST_LINE = 'Owner-approved: yes'
$MAX_READ = 1MB

# `gh` counts only where a command can start, so grep, rg, and a commit message that merely mention
# it pass. The text is scanned as written, so a create inside quotes, $( ), or backticks is seen.
$PROGRAM = '(?:"(?:[^"]*[\\/])?gh(?:\.exe)?"|''(?:[^'']*[\\/])?gh(?:\.exe)?''|(?:[^\s"''`;&|()]*[\\/])?gh(?:\.exe)?)'
$COMMAND_START = '(?:^|[;|&\n(`])\s*(?:&\s*)?(?:(?:env|command|sudo|time|exec|nohup|then|do|else|if|while|until|[A-Za-z_]\w*=(?:"[^"]*"|''[^'']*''|\S*))\s+)*' + $PROGRAM
$CREATE = $COMMAND_START + '\s+issue\s+(?:(?:-R|--repo)(?:=|\s+)(?:"[^"]*"|\S+)\s+)?(?:create|new)(?=[\s;|&)`]|$)'
$API = $COMMAND_START + '\s+api(?=\s)'
$ISSUES_ENDPOINT = '^(?:https?://[^/]+(?:/api/v3)?)?/?repos/[^/]+/[^/]+/issues/?(?:\?.*)?$'

# Flags that take a value. Reading them by name keeps a title like "drop the -b flag" from counting.
$VALUE_FLAGS = @('--body', '-b', '--body-file', '-F', '--label', '-l', '--title', '-t', '--assignee', '-a',
  '--milestone', '-m', '--project', '-p', '--repo', '-R', '--template', '-T', '--recover')

function Get-CallWords($text, $from) {
  # The words of one command: from $from to the next unquoted separator, quotes removed.
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
  return @($words | ForEach-Object { $_.Value -replace '["'']', '' })
}

function Get-CreateFacts($words) {
  # What a create call carries: whether the body is inline, its labels, and its --body-file value.
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
    elseif (($name -ceq '--body-file' -or $name -ceq '-F') -and -not $facts.File) { $facts.File = $val }
  }
  return $facts
}

function Test-ApiPost($words) {
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

  # .NET matching is case-sensitive unless asked otherwise, which is what these flags need.
  $creates = @([regex]::Matches($text, $CREATE))
  $apiPosts = @([regex]::Matches($text, $API) | Where-Object { Test-ApiPost (Get-CallWords $text ($_.Index + $_.Length)) })
  if ($creates.Count + $apiPosts.Count -eq 0) { exit 0 }
  if ($creates.Count + $apiPosts.Count -gt 1) { Write-Deny 'it files more than one issue (file one issue per call)'; exit 0 }
  if ($apiPosts.Count -eq 1) { Write-Deny 'it creates the issue through gh api'; exit 0 }

  $facts = Get-CreateFacts (Get-CallWords $text ($creates[0].Index + $creates[0].Length))
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
