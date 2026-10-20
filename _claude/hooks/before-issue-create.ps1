# before-issue-create: a PreToolUse hook for Bash calls. It denies a call that files a GitHub
# issue unless the call carries the needs-issue-review label and a body holding the line
# "Owner-approved: yes". It is a reminder, not a guarantee: an agent can type that line, and a
# body the hook cannot read is denied rather than guessed at. Anything else passes untouched,
# with no output and exit 0, and so does any input the hook cannot parse.
#
# Create forms it recognizes:
#   gh issue create (alias: new)  with --body/-b, --body-file/-F, --label/-l (repeated or comma-joined)
#   gh api that POSTs to repos/<owner>/<repo>/issues  (labels[]= and body= fields, body=@file, or --input file)
# A body from stdin (--body-file -, body=@-, --input -) cannot be read here, so it is denied.
#
# The Bash string is split the way a shell splits it: quotes, escapes, command separators, $( )
# and heredoc bodies, so a commit message that only mentions "gh issue create" does not trip it.
$ErrorActionPreference = 'Stop'

$LABEL = 'needs-issue-review'
$LINE_PATTERN = '(?m)^[ \t]*Owner-approved: yes[ \t\r]*$'
$WRAPPERS = @('env', 'command', 'sudo', 'time', 'nohup', 'exec', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', '!')

function New-Spec {
  # Maps each spelling of a value-taking flag to its name. Ordinal, so -f and -F stay apart.
  param([string[]]$Pairs)
  $spec = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::Ordinal)
  foreach ($p in $Pairs) {
    $at = $p.LastIndexOf('=')
    $spec[$p.Substring(0, $at)] = $p.Substring($at + 1)
  }
  return $spec
}

$CREATE_SPEC = New-Spec @(
  '--body=body', '-b=body', '--body-file=bodyfile', '-F=bodyfile', '--label=label', '-l=label',
  '--title=other', '-t=other', '--assignee=other', '-a=other', '--milestone=other', '-m=other',
  '--project=other', '-p=other', '--repo=other', '-R=other', '--template=other', '-T=other',
  '--recover=other'
)
$API_SPEC = New-Spec @(
  '--method=method', '-X=method', '--raw-field=rawfield', '-f=rawfield', '--field=field',
  '-F=field', '--input=input', '--header=other', '-H=other', '--jq=other', '-q=other',
  '--template=other', '-t=other', '--cache=other', '--hostname=other', '--preview=other',
  '-p=other'
)

# ---- shell splitting -------------------------------------------------------------------------
# State lives at script scope so the scanning helpers can share one position.

function Read-HeredocMarker {
  # $script:i sits on "<<". Records the delimiter; the body is skipped at the next newline.
  $script:i += 2
  $strip = $false
  if ($script:i -lt $script:n -and $script:cmd[$script:i] -eq '-') { $strip = $true; $script:i++ }
  while ($script:i -lt $script:n -and ($script:cmd[$script:i] -eq ' ' -or $script:cmd[$script:i] -eq "`t")) { $script:i++ }
  $delim = New-Object System.Text.StringBuilder
  while ($script:i -lt $script:n) {
    $ch = [string]$script:cmd[$script:i]
    if ($ch -eq "'" -or $ch -eq '"') {
      $end = $script:cmd.IndexOf($ch, $script:i + 1)
      if ($end -lt 0) { $end = $script:n }
      [void]$delim.Append($script:cmd.Substring($script:i + 1, $end - $script:i - 1))
      $script:i = [Math]::Min($end + 1, $script:n)
    } elseif ($ch -match '[\s;|&()<>]') {
      break
    } elseif ($ch -eq '\') {
      $script:i++
    } else {
      [void]$delim.Append($ch)
      $script:i++
    }
  }
  $script:pending.Add([pscustomobject]@{ Delim = $delim.ToString(); Strip = $strip })
}

function Skip-HeredocBodies {
  # $script:i sits just after a newline. Skips each pending heredoc body through its delimiter line.
  foreach ($h in $script:pending) {
    while ($script:i -lt $script:n) {
      $eol = $script:cmd.IndexOf("`n", $script:i)
      if ($eol -lt 0) { $eol = $script:n }
      $line = $script:cmd.Substring($script:i, $eol - $script:i).TrimEnd("`r")
      if ($h.Strip) { $line = $line.TrimStart("`t") }
      $script:i = [Math]::Min($eol + 1, $script:n)
      if ($line -ceq $h.Delim) { break }
    }
  }
  $script:pending.Clear()
}

function Read-DoubleQuoted {
  # $script:i sits just after the opening quote. Returns the value and leaves $script:i past the
  # closing quote. A $( ) inside is kept as typed.
  $sb = New-Object System.Text.StringBuilder
  while ($script:i -lt $script:n) {
    $ch = [string]$script:cmd[$script:i]
    if ($ch -eq '"') { $script:i++; return $sb.ToString() }
    if ($ch -eq '\' -and $script:i + 1 -lt $script:n) {
      $nx = [string]$script:cmd[$script:i + 1]
      if ($nx -eq '"' -or $nx -eq '\' -or $nx -eq '$' -or $nx -eq '`') {
        [void]$sb.Append($nx)
        $script:i += 2
      } elseif ($nx -eq "`n") {
        $script:i += 2
      } else {
        [void]$sb.Append($ch)
        $script:i++
      }
      continue
    }
    if ($ch -eq '$' -and $script:i + 1 -lt $script:n -and $script:cmd[$script:i + 1] -eq '(') {
      $start = $script:i
      $script:i += 2
      Skip-Substitution
      [void]$sb.Append($script:cmd.Substring($start, $script:i - $start))
      continue
    }
    [void]$sb.Append($ch)
    $script:i++
  }
  return $sb.ToString()
}

function Skip-Substitution {
  # $script:i sits just after "$(". Leaves it just past the matching ")".
  $saved = $script:pending
  $script:pending = New-Object System.Collections.Generic.List[object]
  $depth = 1
  while ($script:i -lt $script:n) {
    $ch = [string]$script:cmd[$script:i]
    $next = if ($script:i + 1 -lt $script:n) { [string]$script:cmd[$script:i + 1] } else { '' }
    if ($ch -eq "'") {
      $end = $script:cmd.IndexOf("'", $script:i + 1)
      $script:i = if ($end -lt 0) { $script:n } else { $end + 1 }
    } elseif ($ch -eq '"') {
      $script:i++
      [void](Read-DoubleQuoted)
    } elseif ($ch -eq '\') {
      $script:i += 2
    } elseif ($ch -eq '$' -and $next -eq '(') {
      $script:i += 2
      Skip-Substitution
    } elseif ($ch -eq '(') {
      $depth++
      $script:i++
    } elseif ($ch -eq ')') {
      $depth--
      $script:i++
      if ($depth -eq 0) { break }
    } elseif ($ch -eq '<' -and $next -eq '<') {
      if ($script:i + 2 -lt $script:n -and $script:cmd[$script:i + 2] -eq '<') { $script:i += 3 } else { Read-HeredocMarker }
    } elseif ($ch -eq "`n") {
      $script:i++
      if ($script:pending.Count -gt 0) { Skip-HeredocBodies }
    } else {
      $script:i++
    }
  }
  $script:pending = $saved
}

function Split-Shell {
  # Returns a list of commands; each command is a string[] of its words.
  param([string]$Text)
  $script:cmd = $Text
  $script:n = $Text.Length
  $script:i = 0
  $script:pending = New-Object System.Collections.Generic.List[object]
  $segments = New-Object System.Collections.Generic.List[object]
  $tokens = New-Object System.Collections.Generic.List[string]
  $word = New-Object System.Text.StringBuilder
  $inWord = $false
  $endWord = {
    if ($inWord) { $tokens.Add($word.ToString()); [void]$word.Clear(); $inWord = $false }
  }
  $endSegment = {
    . $endWord
    if ($tokens.Count -gt 0) { $segments.Add($tokens.ToArray()); $tokens = New-Object System.Collections.Generic.List[string] }
  }

  while ($script:i -lt $script:n) {
    $ch = [string]$Text[$script:i]
    $next = if ($script:i + 1 -lt $script:n) { [string]$Text[$script:i + 1] } else { '' }
    if ($ch -eq "'") {
      $inWord = $true
      $end = $Text.IndexOf("'", $script:i + 1)
      if ($end -lt 0) { $end = $script:n }
      [void]$word.Append($Text.Substring($script:i + 1, $end - $script:i - 1))
      $script:i = [Math]::Min($end + 1, $script:n)
    } elseif ($ch -eq '"') {
      $inWord = $true
      $script:i++
      [void]$word.Append((Read-DoubleQuoted))
    } elseif ($ch -eq '$' -and $next -eq "'") {
      $inWord = $true
      $script:i += 2
      while ($script:i -lt $script:n -and $Text[$script:i] -ne "'") {
        $c = [string]$Text[$script:i]
        if ($c -eq '\' -and $script:i + 1 -lt $script:n) {
          $e = [string]$Text[$script:i + 1]
          $map = @{ 'n' = "`n"; 't' = "`t"; 'r' = "`r"; '\' = '\'; "'" = "'"; '"' = '"' }
          if ($map.ContainsKey($e)) { [void]$word.Append($map[$e]) } else { [void]$word.Append($c + $e) }
          $script:i += 2
        } else {
          [void]$word.Append($c)
          $script:i++
        }
      }
      $script:i++
    } elseif ($ch -eq '$' -and $next -eq '(') {
      . $endSegment
      $script:i += 2
    } elseif ($ch -eq '\') {
      if ($next -eq "`n") {
        $script:i += 2
      } elseif ($next -ne '') {
        $inWord = $true
        [void]$word.Append($next)
        $script:i += 2
      } else {
        $script:i++
      }
    } elseif ($ch -eq ' ' -or $ch -eq "`t" -or $ch -eq "`r") {
      . $endWord
      $script:i++
    } elseif ($ch -eq "`n") {
      . $endSegment
      $script:i++
      if ($script:pending.Count -gt 0) { Skip-HeredocBodies }
    } elseif ($ch -eq ';' -or $ch -eq '|' -or $ch -eq '&' -or $ch -eq '(' -or $ch -eq ')' -or $ch -eq '`') {
      . $endSegment
      $script:i++
    } elseif ($ch -eq '<' -and $next -eq '<') {
      . $endWord
      if ($script:i + 2 -lt $script:n -and $Text[$script:i + 2] -eq '<') { $script:i += 3 } else { Read-HeredocMarker }
    } elseif ($ch -eq '#' -and -not $inWord) {
      while ($script:i -lt $script:n -and $Text[$script:i] -ne "`n") { $script:i++ }
    } else {
      $inWord = $true
      [void]$word.Append($ch)
      $script:i++
    }
  }
  . $endSegment
  return , $segments
}

# ---- reading flags and files -----------------------------------------------------------------

function Get-GhArguments {
  # The words after "gh" when this command is a gh call, else $null.
  param([string[]]$Words)
  $k = 0
  $wrapped = $false
  while ($k -lt $Words.Count) {
    $w = $Words[$k]
    if ($w -match '^[A-Za-z_][A-Za-z0-9_]*=') { $k++; continue }
    if ($WRAPPERS -contains $w) { $wrapped = $true; $k++; continue }
    if ($wrapped -and $w.StartsWith('-')) { $k++; continue }
    break
  }
  if ($k -ge $Words.Count) { return $null }
  $leaf = ($Words[$k] -replace '^.*[\\/]', '') -replace '\.exe$', ''
  if ($leaf -cne 'gh') { return $null }
  $rest = @()
  if ($k + 1 -lt $Words.Count) { $rest = $Words[($k + 1)..($Words.Count - 1)] }
  return [pscustomobject]@{ Args = $rest }
}

function Read-Flags {
  # Splits words into the flags named in $Spec (with their values) and the other words.
  param([string[]]$Words, $Spec)
  $flags = New-Object System.Collections.Generic.List[object]
  $positional = New-Object System.Collections.Generic.List[string]
  for ($k = 0; $k -lt $Words.Count; $k++) {
    $t = $Words[$k]
    if ($t -eq '--') {
      for ($m = $k + 1; $m -lt $Words.Count; $m++) { $positional.Add($Words[$m]) }
      break
    }
    if ($t.StartsWith('--')) {
      $name = $t
      $val = $null
      $eq = $t.IndexOf('=')
      if ($eq -gt 0) { $name = $t.Substring(0, $eq); $val = $t.Substring($eq + 1) }
      if ($Spec.ContainsKey($name)) {
        if ($null -eq $val) {
          $val = ''
          if ($k + 1 -lt $Words.Count) { $k++; $val = $Words[$k] }
        }
        $flags.Add([pscustomobject]@{ Name = $Spec[$name]; Value = $val })
      }
    } elseif ($t.Length -gt 1 -and $t.StartsWith('-')) {
      $short = $t.Substring(0, 2)
      if ($Spec.ContainsKey($short)) {
        $val = $t.Substring(2)
        if ($val.StartsWith('=')) { $val = $val.Substring(1) }
        if ($t.Length -eq 2) {
          $val = ''
          if ($k + 1 -lt $Words.Count) { $k++; $val = $Words[$k] }
        }
        $flags.Add([pscustomobject]@{ Name = $Spec[$short]; Value = $val })
      }
    } else {
      $positional.Add($t)
    }
  }
  return [pscustomobject]@{ Flags = $flags; Positional = $positional }
}

function Read-SourceFile {
  # The text of a file named in the call, or $null when it cannot be read.
  param([string]$Path)
  $p = $Path
  if ($p -match '^~(/|\\|$)') { $p = $HOME + $p.Substring(1) }
  if (-not [System.IO.Path]::IsPathRooted($p)) { $p = Join-Path $script:workDir $p }
  try {
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return $null }
    return [System.IO.File]::ReadAllText($p, [System.Text.UTF8Encoding]::new($false))
  } catch {
    return $null
  }
}

# A create call, reduced to what the checks need.
function New-Facts {
  return [pscustomobject]@{
    Labels = New-Object System.Collections.Generic.List[string]
    Bodies = New-Object System.Collections.Generic.List[string]
    Stdin = $false
    Unreadable = New-Object System.Collections.Generic.List[string]
  }
}

function Add-BodyFile {
  param($Facts, [string]$Path)
  if ($Path -eq '-') { $Facts.Stdin = $true; return }
  $text = Read-SourceFile $Path
  if ($null -eq $text) { $Facts.Unreadable.Add($Path) } else { $Facts.Bodies.Add($text) }
}

function Get-IssueCreateFacts {
  param([string[]]$Words)
  $facts = New-Facts
  $parsed = Read-Flags $Words $CREATE_SPEC
  foreach ($f in $parsed.Flags) {
    switch ($f.Name) {
      'label' { foreach ($l in $f.Value.Split(',')) { if ($l.Trim()) { $facts.Labels.Add($l.Trim()) } } }
      'body' { $facts.Bodies.Add($f.Value) }
      'bodyfile' { Add-BodyFile $facts $f.Value }
    }
  }
  return $facts
}

function Get-ApiCreateFacts {
  # Facts for a gh api call that POSTs to repos/<owner>/<repo>/issues, else $null.
  param([string[]]$Words)
  $parsed = Read-Flags $Words $API_SPEC
  if ($parsed.Positional.Count -eq 0) { return $null }
  $endpoint = ($parsed.Positional[0] -replace '\?.*$', '').TrimStart('/').TrimEnd('/')
  if ($endpoint -notmatch '^repos/[^/]+/[^/]+/issues$') { return $null }

  $method = $null
  $hasParams = $false
  foreach ($f in $parsed.Flags) {
    if ($f.Name -eq 'method') { $method = $f.Value.ToUpperInvariant() }
    if ($f.Name -in 'field', 'rawfield', 'input') { $hasParams = $true }
  }
  $isPost = if ($null -ne $method) { $method -eq 'POST' } else { $hasParams }
  if (-not $isPost) { return $null }

  $facts = New-Facts
  foreach ($f in $parsed.Flags) {
    if ($f.Name -in 'field', 'rawfield') {
      $eq = $f.Value.IndexOf('=')
      if ($eq -lt 1) { continue }
      $key = $f.Value.Substring(0, $eq)
      $val = $f.Value.Substring($eq + 1)
      if ($key -eq 'labels[]') { $facts.Labels.Add($val.Trim()) }
      if ($key -eq 'body') {
        if ($f.Name -eq 'field' -and $val.StartsWith('@')) { Add-BodyFile $facts $val.Substring(1) } else { $facts.Bodies.Add($val) }
      }
    } elseif ($f.Name -eq 'input') {
      if ($f.Value -eq '-') { $facts.Stdin = $true; continue }
      $text = Read-SourceFile $f.Value
      $json = $null
      if ($null -ne $text) { try { $json = $text | ConvertFrom-Json } catch { $json = $null } }
      if ($null -eq $json) { $facts.Unreadable.Add($f.Value); continue }
      foreach ($l in @($json.labels)) {
        $name = if ($l -is [string]) { $l } else { $l.name }
        if ($name) { $facts.Labels.Add($name.Trim()) }
      }
      if ($json.body -is [string]) { $facts.Bodies.Add($json.body) }
    }
  }
  return $facts
}

function Get-Problems {
  param($Facts)
  $problems = New-Object System.Collections.Generic.List[string]
  if ($Facts.Stdin) {
    $problems.Add('its body comes from stdin, which a hook cannot read: write the body to a file and pass --body-file <file> (or -F body=@<file>)')
  }
  foreach ($path in $Facts.Unreadable) {
    $problems.Add("the file '$path' cannot be read or is not valid: write it in an earlier call, then name it here")
  }
  if (-not ($Facts.Labels -contains $LABEL)) {
    $problems.Add("it has no $LABEL label")
  }
  if (-not $Facts.Stdin -and $Facts.Unreadable.Count -eq 0) {
    $hasLine = $false
    $built = $false
    foreach ($b in $Facts.Bodies) {
      if ($b -cmatch $LINE_PATTERN) { $hasLine = $true }
      if ($b.Contains('$(')) { $built = $true }
    }
    if (-not $hasLine) {
      $hint = if ($built) { ' (the hook reads the body as typed and cannot run a $( ) in it; put the text in a file and use --body-file)' } else { '' }
      $problems.Add("its body has no 'Owner-approved: yes' line$hint")
    }
  }
  return $problems
}

function Write-Deny {
  param([string[]]$Problems)
  $reason = "before-issue-create: this call files an issue, but " + ($Problems -join '; and ') + ". " +
    "The owner's yes comes first: send the hand-off (pipeline/steps/05-hand-off.md) and wait for it. " +
    "Then file with the $LABEL label and the line 'Owner-approved: yes' on its own line in the body."
  $out = [ordered]@{
    hookSpecificOutput = [ordered]@{
      hookEventName = 'PreToolUse'
      permissionDecision = 'deny'
      permissionDecisionReason = $reason
    }
  }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
}

# ---- main ------------------------------------------------------------------------------------

try {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $raw = $reader.ReadToEnd()
  $payload = $raw | ConvertFrom-Json
  $command = $payload.tool_input.command
  if ($command -isnot [string] -or -not $command.Trim()) { exit 0 }

  $script:workDir = (Get-Location).Path
  if ($payload.cwd -is [string] -and (Test-Path -LiteralPath $payload.cwd -PathType Container)) {
    $script:workDir = $payload.cwd
  }

  $problems = New-Object System.Collections.Generic.List[string]
  foreach ($words in (Split-Shell $command)) {
    $gh = Get-GhArguments $words
    if ($null -eq $gh) { continue }
    $a = $gh.Args
    $facts = $null
    if ($a.Count -ge 2 -and $a[0] -ceq 'issue' -and ($a[1] -ceq 'create' -or $a[1] -ceq 'new')) {
      $facts = Get-IssueCreateFacts @($a | Select-Object -Skip 2)
    } elseif ($a.Count -ge 1 -and $a[0] -ceq 'api') {
      $facts = Get-ApiCreateFacts @($a | Select-Object -Skip 1)
    }
    if ($null -ne $facts) {
      foreach ($p in (Get-Problems $facts)) { if (-not $problems.Contains($p)) { $problems.Add($p) } }
    }
  }
  if ($problems.Count -gt 0) { Write-Deny $problems.ToArray() }
  exit 0
} catch {
  # A hook that cannot read its input must not block the work.
  exit 0
}
