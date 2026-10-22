# before-issue-create: a reminder, not a guarantee: an agent can type the Owner-approved line.
# It fails closed: text cannot be reliably told from a command, so any command text that reads like
# a create is judged as one, mentions included.
# Not covered: a loop that runs one create several times, a cd earlier in the same command, gh api
# graphql, curl or other HTTP clients, gh aliases, and non-Bash tools (such as a GitHub connector's
# issue tool) that this hook never sees. Also not covered: a command longer than 10000 characters
# or naming gh more than 12 times is denied unread (a cap on the work the hook does), and a
# --body-file that is not a regular file (a pipe, a device) is denied unopened, so a legitimate use
# of either has to be split or rewritten. Any exception inside the hook allows the call.
$ErrorActionPreference = 'Stop'

$LABEL = 'needs-issue-review'
$FIRST_LINE = 'Owner-approved: yes'
$MAX_READ = 1MB
# Caps on the work done, so a pathological command cannot stall the hook past its timeout.
$MAX_TEXT = 10000
$MAX_GH = 12
$FALLBACK = 'denied; see _claude/hooks/notes.md.'
$coreLoaded = $false
try { . (Join-Path $PSScriptRoot 'hook-core.ps1'); $coreLoaded = $true } catch { }

# Windows resolves GH and Gh.exe, so the program name ignores case; verbs and flags do not.
# The lookbehind keeps a word like "high" from reading as gh.
$GH = '(?<![\w.-])(?i:gh(?:\.exe)?)["'']?(?:\s|\\\r?\n)+'
$CREATE = $GH + 'issue(?:\s|\\\r?\n)+(?:(?:-R|--repo)(?:=|\s+)(?:"[^"]*"|''[^'']*''|\S+)\s+)?(?:create|new)(?![\w-])'
$API = $GH + 'api(?=\s)'
$ISSUES_ENDPOINT = '^(?:https?://[^/]+(?:/api/v3)?)?/?repos/[^/]+/[^/]+/issues/?(?:\?.*)?$'

# Flags that take a value. Reading them by name keeps a title like "drop the -b flag" from counting.
$VALUE_FLAGS = @('--body', '-b', '--body-file', '-F', '--label', '-l', '--title', '-t', '--assignee', '-a',
  '--milestone', '-m', '--project', '-p', '--repo', '-R', '--template', '-T', '--recover')

function Get-SegmentWords([string]$text, [int]$from) {
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
    } elseif ($c -in ';', '|', '&', "`n", ')', '`') {
      break
    }
  }
  $segment = $text.Substring($from, [Math]::Min($i, $text.Length) - $from)
  $words = [regex]::Matches($segment, '(?:\\.|"[^"]*"|''[^'']*''|[^\s"''\\])+')
  # The leading comma keeps a one-word result an array; PowerShell would unroll it to a string.
  return , @($words | ForEach-Object { $_.Value -replace '\\(["''])', '$1' -replace '["'']', '' })
}

function Get-CreateFacts([string[]]$words) {
  $facts = @{ Inline = $false; Labels = @(); File = $null }
  for ($i = 0; $i -lt $words.Count; $i++) {
    $w = $words[$i]
    if ($w -ceq '--') { break }
    if ($w.StartsWith('--')) { $name, $val = $w -split '=', 2 }
    elseif ($w -cmatch '^-[A-Za-z]') { $name = $w.Substring(0, 2); $val = if ($w.Length -gt 2) { $w.Substring(2).TrimStart('=') } else { $null } }
    else { continue }
    if ($VALUE_FLAGS -cnotcontains $name) { continue }
    # An empty value after = is a value, as in gh; only a bare flag takes the next word.
    if ($null -eq $val) { $val = if ($i + 1 -lt $words.Count) { $words[++$i] } else { '' } }
    if ($name -ceq '--body' -or $name -ceq '-b') { $facts.Inline = $true }
    elseif ($name -ceq '--label' -or $name -ceq '-l') { $facts.Labels += $val -split ',' | ForEach-Object { $_.Trim() } }
    elseif ($name -ceq '--body-file' -or $name -ceq '-F') { $facts.File = $val }
  }
  return $facts
}

function Test-IssuesApiPost([string[]]$words) {
  # Fields with no explicit method also POST.
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

# The reason text lives in notes.md (counted there). If that file cannot be read, one generic line
# still denies.
function Get-Reason($why) {
  $note = if ($coreLoaded) { Get-Note 'before-issue-create' } else { $null }
  if (-not $note) { return $FALLBACK }
  return Fill $note @{ why = $why; label = $LABEL; line = $FIRST_LINE }
}

# A regular file, after following a link. A pipe or a device is not, and opening one can block.
# On Unix the shell's own test -f decides (PowerShell reports a pipe as an ordinary file); on
# Windows a directory or a device name is the only non-file this can name.
function Test-RegularFile([string]$path) {
  $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
  if ($item.PSIsContainer) { return $false }
  if ($PSVersionTable.PSVersion.Major -lt 6 -or $IsWindows) {
    return -not ($item.Attributes -band [System.IO.FileAttributes]::Device)
  }
  & test -f $path
  return ($LASTEXITCODE -eq 0)
}

function Write-Deny($why) {
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'PreToolUse'; permissionDecision = 'deny'
      permissionDecisionReason = "before-issue-create: $(Get-Reason $why)" } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
}

try {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $payload = $reader.ReadToEnd() | ConvertFrom-Json
  $text = $payload.tool_input.command
  if ($text -isnot [string]) { exit 0 }
  if ($text.Length -gt $MAX_TEXT) { Write-Deny "its text is longer than $MAX_TEXT characters, too long to check"; exit 0 }

  $creates = @([regex]::Matches($text, $CREATE))
  $apiMatches = @([regex]::Matches($text, $API))
  if ($creates.Count + $apiMatches.Count -gt $MAX_GH) { Write-Deny "its text names gh more than $MAX_GH times, too many to check"; exit 0 }
  $apiPosts = @($apiMatches | Where-Object { Test-IssuesApiPost (Get-SegmentWords $text ($_.Index + $_.Length)) })
  if ($creates.Count + $apiPosts.Count -eq 0) { exit 0 }
  if ($creates.Count + $apiPosts.Count -gt 1) { Write-Deny 'its text names issue creation more than once (one create per call; a title or other text that names the command counts too; file with a neutral title, then write the real title to a file with the Write tool and run gh issue edit <N> --title "$(cat <file>)")'; exit 0 }
  if ($apiPosts.Count -eq 1) { Write-Deny 'it creates the issue through gh api'; exit 0 }

  $facts = Get-CreateFacts (Get-SegmentWords $text ($creates[0].Index + $creates[0].Length))
  if ($facts.Inline) { Write-Deny 'its body is inline'; exit 0 }
  if ($facts.Labels -cnotcontains $LABEL) { Write-Deny "it has no $LABEL label"; exit 0 }
  if (-not $facts.File -or $facts.File -eq '-') { Write-Deny 'its body does not come from a file (stdin cannot be read here)'; exit 0 }

  $path = $facts.File -replace '^~(?=[/\\]|$)', $HOME
  if (-not [System.IO.Path]::IsPathRooted($path) -and $payload.cwd -is [string]) { $path = Join-Path $payload.cwd $path }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Deny "the body file '$($facts.File)' is missing or is a directory"; exit 0 }

  if (-not (Test-RegularFile $path)) { Write-Deny "the body file '$($facts.File)' is not a regular file"; exit 0 }

  # A pathological file must not stall the hook, so read no more than $MAX_READ.
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
