# before-issue-create: a reminder, not a guarantee. It judges filings and adds of the owner-approved
# label, on Bash and PowerShell. The label goes on only as gh issue edit <N> -R owner/name
# --add-label owner-approved, as the whole command, when the owner's last typed message (read from the chat log at
# transcript_path) is an approve and the hand-off it answers has a "#<N> Title:" header for that
# issue (Test-OwnerYes); the owner then sees "Approved: <repo>#<N> <title>", written here. A filing
# that carries the label or whose body's first line starts with Owner-approved: is denied, and so
# is any other add (a gh api write naming it, graphql, two issues), and a shell command naming a
# chat log under .claude/projects. A label held in a variable, a chat log written with the Write
# tool, and the log lagging the conversation (denied with "try again") are not covered.
# It fails closed: text cannot be reliably told from a command, so any command text that reads like
# a create is judged as one, mentions included.
# Covered, and judged the same way: gh issue create, and a gh api POST to repos/<o>/<r>/issues (the
# only way to file in a cloud session, where gh issue create is refused). Either passes only with
# the needs-issue-review label (for gh api: -f/-F/--field/--raw-field 'labels[]=...') and a body from
# a regular file (for gh api: -F or --field body=@<file>).
# An inline body, a missing label, a second create in the same command, a body from stdin or
# --input, and anything it cannot parse are denied. For gh api that includes a field word it cannot
# read (no =, a variable, a command substitution, backticks, $'...' quoting), a second body key of
# any spelling, and an endpoint built from a variable when the call sends any field. A ?query or
# #fragment on the endpoint is ignored when it is matched.
# Not covered: a loop that runs one create several times, a cd earlier in the same command, a create
# through gh api graphql, curl or other HTTP clients, gh aliases, and tools other than Bash and
# PowerShell (such as a GitHub connector's issue tool) that this hook never sees. Also not covered: a command longer than 10000 characters
# or naming gh more than 12 times is denied unread (a cap on the work the hook does), and a
# --body-file that is not a regular file (a pipe, a device) is denied unopened, so a legitimate use
# of either has to be split or rewritten. For gh api, only the fields -f/-F/--field/--raw-field set
# are read; a label inside a trailing shell comment still counts (as it does for gh issue create),
# so this is a reminder, not a guarantee; a body or label sent another way (a nested JSON field, a
# --template, a here-document to --input) is denied or unseen. Any exception inside the hook allows
# the call.
$ErrorActionPreference = 'Stop'

$LABEL = 'needs-issue-review'
$APPROVED = 'owner-approved'
# A body may not claim the owner's approval; it is recorded only as the label, through the tag
# path below. Agents once typed this line to file at all (#175), and a stale reader could still
# trust it.
$CLAIM = '^Owner-approved:'
$TRANSCRIPT = '\.claude[\\/]+projects[\\/][^\s"'']*\.jsonl'
# The one command that adds owner-approved, as the whole command: gh (bare, or a quoted or & path to
# gh.exe whose characters cannot expand), issue edit <N> -R owner/name --add-label owner-approved.
$GH_PATH = '[A-Za-z]:[\\/][A-Za-z0-9 ()\\/._-]*(?i:gh\.exe)'
$TAG_ONLY = '\A[ \t]*(?:&[ \t]*)?(?:(?i:gh(?:\.exe)?)|"' + $GH_PATH + '"|''' + $GH_PATH + ''')[ \t]+issue[ \t]+edit[ \t]+([0-9]+)[ \t]+(?:-R|--repo)[ \t]+([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)[ \t]+--add-label[ \t]+(?:owner-approved|"owner-approved"|''owner-approved'')[ \t]*(?:\r?\n)?\z'
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
$EDIT = $GH + 'issue(?:\s|\\\r?\n)+(?:(?:-R|--repo)(?:=|\s+)(?:"[^"]*"|''[^'']*''|\S+)\s+)?edit(?![\w-])'
# Matched after any ?query or #fragment is cut off the word.
$ISSUES_ENDPOINT = '^(?:https?://[^/]+(?:/api/v3)?)?/?repos/[^/]+/[^/]+/issues/?$'

# Flags that take a value. Reading them by name keeps a title like "drop the -b flag" from counting.
$VALUE_FLAGS = @('--body', '-b', '--body-file', '-F', '--label', '-l', '--title', '-t', '--assignee', '-a',
  '--milestone', '-m', '--project', '-p', '--repo', '-R', '--template', '-T', '--recover')

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
  return Fill $note @{ why = $why; label = $LABEL; approved = $APPROVED }
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

function Write-Deny($why, $shown = $null) {
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'PreToolUse'; permissionDecision = 'deny'
      permissionDecisionReason = "before-issue-create: $(Get-Reason $why)" } }
  if ($shown) { $out.systemMessage = $shown }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
}

# Allows the tag add and puts one line on the owner's screen, written here, not by the model.
function Write-Allow([string]$shown) {
  $out = [ordered]@{ systemMessage = $shown; hookSpecificOutput = [ordered]@{
      hookEventName = 'PreToolUse'; permissionDecision = 'allow' } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
}

function Get-Gh {
  if ($env:GOVERNANCE_GH) { return $env:GOVERNANCE_GH }
  $cmd = Get-Command gh -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return 'C:\Program Files\GitHub CLI\gh.exe'
}

# owner/name of the origin remote of the folder, or $null.
function Get-OriginRepo($cwd) {
  if ($cwd -isnot [string]) { return $null }
  # Windows PowerShell 5.1 throws on a native command's stderr under Stop, so read it under Continue.
  $ErrorActionPreference = 'Continue'
  $url = (& git -C $cwd remote get-url origin 2>$null | Select-Object -First 1)
  if ([string]$url -match 'github\.com[:/]([^/\s]+)/([^/\s]+?)(?:\.git)?/?$') { return "$($Matches[1])/$($Matches[2])" }
  return $null
}

# The issue's title, read with gh in at most 5 seconds, or '' when it cannot be read.
function Get-IssueTitle([string]$repo, [string]$number) {
  try {
    $gh = Get-Gh
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $ghArgs = "api repos/$repo/issues/$number --jq .title"
    if ($gh -like '*.ps1') {
      $info.FileName = (Get-Process -Id $PID).Path
      $info.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$gh`" $ghArgs"
    } else { $info.FileName = $gh; $info.Arguments = $ghArgs }
    $info.UseShellExecute = $false; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $proc = [System.Diagnostics.Process]::Start($info)
    $out = $proc.StandardOutput.ReadToEndAsync()
    if (-not $proc.WaitForExit(5000)) { try { $proc.Kill() } catch { }; return '' }
    if ($proc.ExitCode -ne 0) { return '' }
    return ($out.Result -replace '\s+', ' ').Trim()
  } catch { return '' }
}

function Get-Distance([string]$a, [string]$b) {
  # Two rows of the edit-distance table; Windows PowerShell 5.1 cannot parse a 2D index.
  $prev = @(0..$b.Length)
  for ($i = 1; $i -le $a.Length; $i++) {
    $cur = @($i) + @(1..$b.Length | ForEach-Object { 0 })
    for ($j = 1; $j -le $b.Length; $j++) {
      $cost = if ($a[$i - 1] -ceq $b[$j - 1]) { 0 } else { 1 }
      $cur[$j] = [Math]::Min([Math]::Min($prev[$j] + 1, $cur[$j - 1] + 1), $prev[$j - 1] + $cost)
    }
    $prev = $cur
  }
  return $prev[$b.Length]
}

# Whether a typed message is a plain yes: one word starting with a, within two letters of approve,
# approved or approval, optionally after yes, ok or okay. Any ? fails (a question is not a yes).
function Test-ApproveWords([string]$message) {
  if ($message -match '\?') { return $false }
  $words = @(($message.ToLowerInvariant() -replace '[.,!]', ' ').Trim() -split '\s+' | Where-Object { $_ })
  if ($words.Count -eq 2 -and @('yes', 'ok', 'okay') -ccontains $words[0]) { $words = @($words[1]) }
  if ($words.Count -ne 1) { return $false }
  $w = $words[0]
  if ($w -cnotmatch '^a[a-z]*$') { return $false }
  foreach ($target in 'approve', 'approved', 'approval') { if ((Get-Distance $w $target) -le 2) { return $true } }
  return $false
}

# The text of a transcript entry's message: a plain string, or its text blocks joined.
function Get-EntryText($entry) {
  $c = $entry.message.content
  if ($c -is [string]) { return $c }
  return (@($c | Where-Object { $_.type -ceq 'text' } | ForEach-Object { [string]$_.text }) -join "`n")
}

# The owner's yes for one issue. @{ Ok; Title } or @{ Ok = $false; Why; Short }. The yes is the last
# typed message in the chat log (origin.kind human); what it covers is the hand-off it answers: the
# assistant text since the typed message before it, which must end with "Approve?" and hold a
# header line "#<N> Title:" (or "owner/name#<N> Title:") for this issue. Each issue is tagged once
# per yes (.run_state/approvals.log). A subagent never approves.
function Test-OwnerYes($payload, [string]$repo, [string]$number) {
  $no = { param($why, $short) @{ Ok = $false; Why = $why; Short = $short } }
  if ($payload.PSObject.Properties['agent_id'] -and $payload.agent_id) { return & $no 'a subagent cannot approve' 'Only the main session tags, after your approve.' }
  if ($repo -cnotmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { return & $no 'its repo could not be read as owner/name' 'Its repo could not be read.' }
  $path = $payload.transcript_path
  if ($path -isnot [string] -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { return & $no 'the chat log could not be read; try again' 'The chat log could not be read yet.' }
  # Only the tail is parsed, back to the second-last typed message, so a long log stays fast. A
  # subagent's turns (isSidechain) are not the main chat and are skipped.
  $lines = [System.IO.File]::ReadAllLines($path)
  $list = New-Object System.Collections.Generic.List[object]
  $seen = 0
  for ($k = $lines.Count - 1; $k -ge 0 -and $seen -lt 2; $k--) {
    # Only typed messages and assistant text matter, so other lines (tool output) are never parsed.
    $raw = $lines[$k]
    if ($raw.Contains('"isSidechain":true') -or -not ($raw.Contains('"kind":"human"') -or $raw.Contains('"type":"assistant"'))) { continue }
    try { $e = $raw | ConvertFrom-Json } catch { continue }
    if ($e.PSObject.Properties['isSidechain'] -and $e.isSidechain) { continue }
    $list.Insert(0, $e)
    if ($e.type -ceq 'user' -and $e.PSObject.Properties['origin'] -and $e.origin.kind -ceq 'human') { $seen++ }
  }
  $entries = $list.ToArray()
  $human = @()
  for ($i = 0; $i -lt $entries.Count; $i++) {
    $e = $entries[$i]
    if ($e.type -ceq 'user' -and $e.PSObject.Properties['origin'] -and $e.origin.kind -ceq 'human') { $human += $i }
  }
  if ($human.Count -eq 0) { return & $no 'no typed message from the owner is in the chat log yet; try again' 'No message from you is in the log yet.' }
  $last = $human[-1]
  if (-not (Test-ApproveWords (Get-EntryText $entries[$last]))) { return & $no 'the owner''s last message is not an approve' 'Your last message was not an approve.' }
  $from = if ($human.Count -gt 1) { $human[-2] + 1 } else { 0 }
  $texts = @()
  for ($i = $from; $i -lt $last; $i++) {
    if ($entries[$i].type -ceq 'assistant') { $t = Get-EntryText $entries[$i]; if ($t.Trim()) { $texts += $t } }
  }
  if ($texts.Count -eq 0 -or $texts[-1].TrimEnd() -cnotmatch 'Approve\?$') { return & $no 'the message the owner answered is not a hand-off ending in "Approve?"' 'The message you answered did not ask Approve?.' }
  $origin = Get-OriginRepo $payload.cwd
  $named = $false
  foreach ($m in [regex]::Matches(($texts -join "`n"), '(?m)^\s*(?:([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+))?#([0-9]+) Title:')) {
    $r = if ($m.Groups[1].Value) { $m.Groups[1].Value } else { $origin }
    if ($m.Groups[2].Value -ceq $number -and $r -ceq $repo) { $named = $true }
  }
  if (-not $named) { return & $no "the hand-off the owner answered has no header line for $repo#$number" 'That issue was not in the hand-off you answered.' }
  $root = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { $payload.cwd }
  $dir = Join-Path $root '.run_state'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $log = Join-Path $dir 'approvals.log'
  $key = "$($entries[$last].uuid) $repo#$number"
  if ((Test-Path -LiteralPath $log) -and (@(Get-Content -LiteralPath $log) -ccontains $key)) { return & $no 'this yes already tagged that issue' 'Already tagged on this approve.' }
  Add-Content -LiteralPath $log -Value $key -Encoding utf8
  return @{ Ok = $true; Title = (Get-IssueTitle $repo $number) }
}

try {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $payload = $reader.ReadToEnd() | ConvertFrom-Json
  $text = $payload.tool_input.command
  if ($text -isnot [string]) { exit 0 }
  # The command reading lives in hook-core.ps1, so without it a command that names a create or a
  # gh api call is denied unread.
  if (-not $coreLoaded) {
    if ($text -match $CREATE -or $text -match $API -or $text -match $EDIT -or $text -imatch $TRANSCRIPT) { Write-Deny 'the hook could not load hook-core.ps1 to read it' }
    exit 0
  }
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
  # The chat log is the record of the owner's yes, so a shell command that names it is denied.
  if ($text -imatch $TRANSCRIPT) { Write-Deny 'it names a chat log under .claude/projects, which holds the record of the owner''s yes'; exit 0 }

  # owner-approved goes on in one way only: gh issue edit <N> -R owner/name --add-label
  # owner-approved, as the whole command, right after the owner's typed approve of a hand-off that
  # named <N> (Test-OwnerYes). Every other add (a second label with it, two issues, a gh api write
  # that names it, graphql) is denied. Removing the label stays allowed.
  # The allow covers the whole command, so the tag command must be the whole command (nothing
  # chained before or after it), and must name its repo, so the repo checked is the repo gh writes.
  foreach ($m in @([regex]::Matches($text, $EDIT))) {
    $words = Get-SegmentWords $text ($m.Index + $m.Length)
    $labels = @()
    for ($i = 0; $i -lt $words.Count; $i++) {
      $name, $val = $words[$i] -split '=', 2
      if ($name -ceq '--add-label') {
        if ($null -eq $val) { $val = if ($i + 1 -lt $words.Count) { $words[++$i] } else { '' } }
        $labels += @($val -split ',' | ForEach-Object { $_.Trim() })
      }
    }
    if ($labels -inotcontains $APPROVED) { continue }
    $tag = [regex]::Match($text, $TAG_ONLY)
    if (-not $tag.Success) {
      Write-Deny "it adds the $APPROVED label in another shape; the whole command must be gh issue edit <N> -R owner/name --add-label $APPROVED, nothing else"; exit 0
    }
    $number = $tag.Groups[1].Value; $repo = $tag.Groups[2].Value
    # Unlike the rest of this hook, the tag path fails closed: an exception never approves.
    try { $verdict = Test-OwnerYes $payload $repo $number }
    catch { $verdict = @{ Ok = $false; Why = 'the approval check failed'; Short = 'The check failed; ask again.' } }
    if ($verdict.Ok) { Write-Allow "Approved: $repo#$number $($verdict.Title)".TrimEnd() }
    else { Write-Deny $verdict.Why "Not approved: $repo#$number. $($verdict.Short)" }
    exit 0
  }
  foreach ($words in $apiCalls) {
    if (-not ($words | Where-Object { $_ -imatch [regex]::Escape($APPROVED) })) { continue }
    $call = Read-ApiCall $words
    $method = $null
    for ($i = 0; $i -lt $words.Count; $i++) {
      if ($words[$i] -cmatch '^(?:-X|--method=?)(.*)$') { $method = if ($Matches[1]) { $Matches[1] } else { $words[++$i] } }
    }
    $sends = $call.Fields.Count -gt 0 -or $call.Input
    $read = ($method -ieq 'GET' -or $method -ieq 'DELETE') -or (-not $method -and -not $sends)
    if (-not $read) { Write-Deny "it names the $APPROVED label in a gh api call that writes"; exit 0 }
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
  if ($facts.Labels -icontains $APPROVED) { Write-Deny "it files with the $APPROVED label"; exit 0 }
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
  if (($head -split "`n", 2)[0].TrimEnd("`r") -imatch $CLAIM) {
    Write-Deny "the first line of '$($facts.File)' claims the owner's approval"
  }
  exit 0
} catch {
  exit 0
}
