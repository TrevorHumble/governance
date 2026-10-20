# before-issue-create: a PreToolUse hook for Bash calls. It denies filing a GitHub issue unless the
# call is `gh issue create` with the needs-issue-review label and --body-file <file> (or -F <file>),
# where the file holds the line "Owner-approved: yes". Every other way of creating an issue is denied
# with a message naming that form. A command whose first word is git passes, so commit messages that
# mention the command are safe. It scans the command text as written, so a create inside quotes,
# $( ) or backticks is seen. It is a reminder, not a guarantee: an agent can type the line, and it
# cannot see into bash -c strings, a cd earlier in the same command, or gh api graphql.
# Any failure inside the hook allows the call.
$ErrorActionPreference = 'Stop'

$LABEL = 'needs-issue-review'
$LINE = '(?m)^[ \t]*Owner-approved: yes[ \t\r]*$'
$VALUE = '(?:=|\s+)(?:"([^"]*)"|''([^'']*)''|([^\s"'')`;&|]+))'

function Get-Values($text, $flags) {
  # Every value given to one of the flags, quotes removed.
  $found = foreach ($m in [regex]::Matches($text, "(?:^|\s)(?:$flags)$VALUE")) {
    ($m.Groups[1].Value, $m.Groups[2].Value, $m.Groups[3].Value) | Where-Object { $_ } | Select-Object -First 1
  }
  return @($found)
}

function Test-ApiPost($text) {
  # A gh api call on exactly repos/<owner>/<repo>/issues that POSTs (fields with no explicit method also POST).
  if ($text -notmatch '\bgh\s+api\b') { return $false }
  if ($text -notmatch '(?<![\w/.-])/?repos/[^/\s''"]+/[^/\s''"]+/issues/?(?:\?[^\s''"]*)?(?=[\s''"]|$)') { return $false }
  $method = [regex]::Match($text, '(?:^|\s)(?:-X|--method)(?:=|\s*)["'']?([A-Za-z]+)')
  if ($method.Success) { return $method.Groups[1].Value -ieq 'POST' }
  return $text -match '(?:^|\s)(?:-[fF]|--field\b|--raw-field\b|--input\b)'
}

function Write-Deny($why) {
  $reason = "before-issue-create: this call files an issue, but $why. File an issue one way: " +
    "gh issue create --label $LABEL --body-file <file>, where the file holds the line 'Owner-approved: yes'. " +
    "The owner's yes comes first: send the hand-off (pipeline/steps/05-hand-off.md) and wait for it."
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'PreToolUse'; permissionDecision = 'deny'; permissionDecisionReason = $reason } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
}

try {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $payload = $reader.ReadToEnd() | ConvertFrom-Json
  $text = $payload.tool_input.command
  if ($text -isnot [string] -or $text -match '^\s*(?:\S*[/\\])?git(?:\s|$)') { exit 0 }

  $creates = $text -match '\bgh\s+issue\s+(?:create|new)\b'
  if (-not $creates -and -not (Test-ApiPost $text)) { exit 0 }
  if (-not $creates) { Write-Deny 'it creates the issue through gh api'; exit 0 }

  if ($text -match '(?:^|\s)(?:--body|-b)(?![\w-])') { Write-Deny 'its body is inline'; exit 0 }
  $labels = Get-Values $text '--label|-l' | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() }
  if ($labels -notcontains $LABEL) { Write-Deny "it has no $LABEL label"; exit 0 }
  $file = Get-Values $text '--body-file|-F' | Select-Object -First 1
  if (-not $file -or $file -eq '-') { Write-Deny 'its body does not come from a file (stdin cannot be read here)'; exit 0 }

  $path = $file -replace '^~(?=[/\\]|$)', $HOME
  if (-not [System.IO.Path]::IsPathRooted($path) -and $payload.cwd -is [string]) { $path = Join-Path $payload.cwd $path }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Deny "the body file '$file' cannot be read" ; exit 0 }
  if ([System.IO.File]::ReadAllText($path) -cnotmatch $LINE) { Write-Deny "the body file '$file' has no 'Owner-approved: yes' line"; exit 0 }
  exit 0
} catch {
  exit 0
}
