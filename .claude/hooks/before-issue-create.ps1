# before-issue-create: a reminder, not a guarantee: an agent can type the Owner-approved line.
# It fails closed: text cannot be reliably told from a command, so any command text that reads like
# a create is judged as one, mentions included.
# Covered, and judged the same way: gh issue create, and a gh api POST to repos/<o>/<r>/issues (the
# only way to file in a cloud session, where gh issue create is refused). Either passes only with
# the needs-issue-review label (for gh api: -f/-F/--field/--raw-field 'labels[]=...') and a body from
# a regular file whose first line is Owner-approved: yes (for gh api: -F or --field body=@<file>).
# An inline body, a missing label, a second create in the same command, a body from stdin or
# --input, and anything it cannot parse are denied. For gh api that includes a field word it cannot
# read (no =, a variable, a command substitution, backticks, $'...' quoting), a second body key of
# any spelling, and an endpoint built from a variable when the call sends any field. A ?query or
# #fragment on the endpoint is ignored when it is matched.
# Not covered: a loop that runs one create several times, a cd earlier in the same command, gh api
# graphql, curl or other HTTP clients, gh aliases, and non-Bash tools (such as a GitHub connector's
# issue tool) that this hook never sees. Also not covered: a command longer than 10000 characters
# or naming gh more than 12 times is denied unread (a cap on the work the hook does), and a
# --body-file that is not a regular file (a pipe, a device) is denied unopened, so a legitimate use
# of either has to be split or rewritten. For gh api, only the fields -f/-F/--field/--raw-field set
# are read; a label inside a trailing shell comment still counts (as it does for gh issue create),
# so this is a reminder, not a guarantee; a body or label sent another way (a nested JSON field, a
# --template, a here-document to --input) is denied or unseen. Any exception inside the hook allows
# the call.
$ErrorActionPreference = 'Stop'

$LABEL = 'needs-issue-review'
$FIRST_LINE = 'Owner-approved: yes'
$MAX_READ = 1MB
# Caps on the work done, so a pathological command cannot stall the hook past its timeout.
$MAX_TEXT = 10000
$MAX_GH = 12
$FALLBACK = 'denied; see .claude/hooks/notes.md.'
$coreLoaded = $false
try { . (Join-Path $PSScriptRoot 'hook-core.ps1'); $coreLoaded = $true } catch { }

# Windows resolves GH and Gh.exe, so the program name ignores case; verbs and flags do not.
# The lookbehind keeps a word like "high" from reading as gh.
$GH = '(?<![\w.-])(?i:gh(?:\.exe)?)["'']?(?:\s|\\\r?\n)+'
$CREATE = $GH + 'issue(?:\s|\\\r?\n)+(?:(?:-R|--repo)(?:=|\s+)(?:"[^"]*"|''[^'']*''|\S+)\s+)?(?:create|new)(?![\w-])'
$API = $GH + 'api(?=\s)'
# Matched after any ?query or #fragment is cut off the word.
$ISSUES_ENDPOINT = '^(?:https?://[^/]+(?:/api/v3)?)?/?repos/[^/]+/[^/]+/issues/?$'

# Flags that take a value. Reading them by name keeps a title like "drop the -b flag" from counting.
$VALUE_FLAGS = @('--body', '-b', '--body-file', '-F', '--label', '-l', '--title', '-t', '--assignee', '-a',
  '--milestone', '-m', '--project', '-p', '--repo', '-R', '--template', '-T', '--recover')

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

# A word the hook cannot read as written: it holds a variable, a command substitution or backticks,
# or starts a $'...' string (the quotes are already stripped, so it shows as a leading $).
function Test-Unreadable([string]$word) { return $word -match '[$`]' }

# The label, body and --input of one gh api call to the issues endpoint. -f and --raw-field send
# text; -F and --field send a typed value, where body=@<file> reads the file. Anything it cannot
# read (a field with no =, a variable, a second body of any spelling) is flagged, never guessed.
function Get-ApiFacts([string[]]$words) {
  $call = Read-ApiCall $words
  $facts = @{ Inline = $false; Labels = @(); File = $null; Input = $call.Input; Bodies = 0; Unreadable = $false }
  foreach ($p in $call.Positionals) { if (Test-Unreadable $p) { $facts.Unreadable = $true } }
  foreach ($f in $call.Fields) {
    $eq = $f.Text.IndexOf('=')
    if ($eq -lt 0 -or (Test-Unreadable $f.Text)) { $facts.Unreadable = $true; continue }
    $key = $f.Text.Substring(0, $eq); $value = $f.Text.Substring($eq + 1)
    if ($key -ceq 'labels[]') { $facts.Labels += $value }
    elseif ($key -ceq 'body') {
      $facts.Bodies++
      if ($f.Typed -and $value.StartsWith('@')) { $facts.File = $value.Substring(1) } else { $facts.Inline = $true }
    }
    elseif ($key -match '^(?i:body)(?:\[.*\])?$') { $facts.Bodies++; $facts.Inline = $true }
  }
  return $facts
}

function Test-IssuesApiPost([string[]]$words) {
  # Fields with no explicit method also POST.
  if (-not ($words | Where-Object { ($_ -replace '[?#].*$', '') -match $ISSUES_ENDPOINT })) { return $false }
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
  # The words of each gh api call, read once.
  $apiCalls = @($apiMatches | ForEach-Object { , (Get-SegmentWords $text ($_.Index + $_.Length)) })
  # An endpoint built from a variable cannot be told from the issues endpoint, so a call that has one
  # and also sends fields is denied.
  foreach ($m in $apiMatches) {
    $call = Read-ApiCall (Get-SegmentWords $text ($m.Index + $m.Length) $true)
    if ($call.Fields.Count -gt 0 -or $call.Input) {
      if (@($call.Positionals | Where-Object { Test-Unreadable $_ }).Count -gt 0) {
        Write-Deny 'its gh api endpoint is built from a variable or command substitution and it sends fields, so it cannot be told from the issues endpoint'
        exit 0
      }
    }
  }
  $apiPosts = @(); $apiPostWords = $null
  foreach ($words in $apiCalls) { if (Test-IssuesApiPost $words) { $apiPosts += 1; $apiPostWords = $words } }
  if ($creates.Count + $apiPosts.Count -eq 0) { exit 0 }
  if ($creates.Count + $apiPosts.Count -gt 1) { Write-Deny 'its text names issue creation more than once (one create per call; a title or other text that names the command counts too; file with a neutral title, then write the real title to a file with the Write tool and run gh issue edit <N> --title "$(cat <file>)")'; exit 0 }

  if ($apiPosts.Count -eq 1) {
    $facts = Get-ApiFacts $apiPostWords
    if ($facts.Unreadable) { Write-Deny 'a gh api field or word cannot be read as written (a field with no =, a variable, a command substitution, or $-quoting)'; exit 0 }
    if ($facts.Input) { Write-Deny 'its body comes from --input, which cannot be read here'; exit 0 }
    if ($facts.Bodies -gt 1) { Write-Deny 'it gives more than one body field'; exit 0 }
  } else {
    $facts = Get-CreateFacts (Get-SegmentWords $text ($creates[0].Index + $creates[0].Length))
  }
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
