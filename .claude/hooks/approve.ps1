# approve: a UserPromptExpansion hook. When the owner types /approve, it adds the owner-approved
# label to every issue in .run_state/waiting.json under the project root (an array of
# {repo, number, title}, repo as owner/name). Claude Code fires this event only for a command the
# user types, never for the model's own Skill call. before-issue-create refuses every other add of
# the label, and any Bash or PowerShell command that names this script outside git. A reminder,
# not a guarantee: a script on disk cannot tell who started it, so an agent that runs it some other
# way (a node or python child process) is not seen.
# After each issue it rewrites .run_state/approved-last.json (each entry so far, with ok true or
# false) and waiting.json (the entries not yet approved), so a timeout leaves a true record and the
# next /approve picks up the rest. The approve skill reads approved-last.json to show the owner.
# It never blocks the command and prints nothing. It does not unlock edits.
# gh comes from GOVERNANCE_GH (tests), else PATH, else the Windows install path.
# Like unlock-edits, it does not load hook-core.ps1, so a broken core cannot stop the owner's
# /approve; the gh and project-root lookups are repeated here on purpose.
$ErrorActionPreference = 'Stop'

function Write-Json([string]$path, $value) {
  $text = ConvertTo-Json -InputObject @($value) -Depth 4
  Set-Content -LiteralPath $path -Value $text -Encoding utf8
}

try {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $raw = $reader.ReadToEnd()
  if ($raw.Trim() -eq '') { exit 0 }
  $payload = $raw | ConvertFrom-Json
  if ($payload.expansion_type -cne 'slash_command' -or $payload.command_name -cne 'approve') { exit 0 }
  $root = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } elseif ($payload.cwd -is [string]) { $payload.cwd } else { $null }
  if (-not $root) { exit 0 }
  $dir = Join-Path $root '.run_state'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $waitingPath = Join-Path $dir 'waiting.json'
  $lastPath = Join-Path $dir 'approved-last.json'

  # Cleared first, so a waiting list that cannot be read never leaves an older run's result in view.
  Write-Json $lastPath @()
  $waiting = @()
  if (Test-Path -LiteralPath $waitingPath -PathType Leaf) {
    $text = Get-Content -LiteralPath $waitingPath -Raw
    # Windows PowerShell 5.1 hands a parsed JSON array down the pipeline as one item, so enumerate it.
    if ($text -and $text.Trim()) { $parsed = ConvertFrom-Json $text; foreach ($e in $parsed) { $waiting += $e } }
  }

  $gh = $env:GOVERNANCE_GH
  if (-not $gh) {
    $cmd = Get-Command gh -ErrorAction SilentlyContinue
    $gh = if ($cmd) { $cmd.Source } else { 'C:\Program Files\GitHub CLI\gh.exe' }
  }

  $done = @()
  $left = [System.Collections.ArrayList]@($waiting)
  foreach ($entry in $waiting) {
    $repo = [string]$entry.repo
    $number = [string]$entry.number
    $ok = $false
    # The title shown to the owner is read from GitHub, not taken from the agent-written list, so a
    # swapped number or repo shows up in the report.
    $title = ''
    if ($repo -cmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' -and $number -cmatch '^[0-9]+$') {
      try {
        $title = [string]((& $gh api "repos/$repo/issues/$number" --jq .title 2>$null) -join ' ')
        if ($LASTEXITCODE -eq 0) {
          & $gh api "repos/$repo/issues/$number/labels" -f 'labels[]=owner-approved' *> $null
          $ok = ($LASTEXITCODE -eq 0)
        }
      } catch { $ok = $false }
    }
    $done += [ordered]@{ repo = $repo; number = $number; title = $title.Trim(); ok = $ok }
    if ($ok) { $left.Remove($entry) }
    Write-Json $lastPath $done
    Write-Json $waitingPath @($left)
  }
  exit 0
} catch {
  exit 0
}
