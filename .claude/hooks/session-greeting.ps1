# session-greeting: a SessionStart hook. It adds a greeting the model reads before the first prompt,
# plus warnings when something would override the seats in seats.json:
#   - the session's model is neither the orchestrator seat nor its hard award (checked only when the
#     input carries `model`; after /clear or a recovery it does not, and the greeting says so);
#   - CLAUDE_CODE_EFFORT_LEVEL is set, or CLAUDE_CODE_SUBAGENT_MODEL_FORCE is 1;
#   - a maxEffortLevel in settings is below a seat's effort;
#   - .run_state/hard exists at the project root (a leftover marker would move later runs up).
#   - it also turns the git hooks on (core.hooksPath, through tools/setup-hooks.ps1, since a fresh
#     clone does not carry it) and adds a line saying whether commit-msg and pre-commit are armed;
#     with no tools/setup-hooks.ps1 it skips that line.
# The project root is CLAUDE_PROJECT_DIR, else the input's cwd. It never blocks. Unreadable input
# prints nothing; a seats.json that is missing or odd drops only the checks that need it, and the
# hello line always prints.
$ErrorActionPreference = 'Stop'

$EFFORTS = @('low', 'medium', 'high', 'xhigh', 'max')

# The lowest maxEffortLevel any settings file sets, as an index into $EFFORTS, or -1 for none.
function Get-LowestCap([string]$root) {
  $configDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
  $files = @((Join-Path $root '.claude/settings.json'), (Join-Path $root '.claude/settings.local.json'),
    (Join-Path $configDir 'settings.json'))
  $lowest = -1
  foreach ($f in $files) {
    try {
      $cap = (Get-Content -LiteralPath $f -Raw | ConvertFrom-Json).maxEffortLevel
      $i = if ($cap -is [string]) { $EFFORTS.IndexOf($cap.ToLowerInvariant()) } else { -1 }
      if ($i -ge 0 -and ($lowest -lt 0 -or $i -lt $lowest)) { $lowest = $i }
    } catch { }
  }
  return $lowest
}

try {
  . (Join-Path $PSScriptRoot 'hook-core.ps1')
  $payload = (Read-Stdin) | ConvertFrom-Json
  if ($null -eq $payload) { exit 0 }
  $hello = Get-Note 'session-greeting' 'hello'
  if (-not $hello) { exit 0 }
  $lines = @($hello)
  $root = Get-ProjectRoot $payload

  # Turn the git hooks on, then say which of the two are armed: the path is set and the file is there.
  try {
    $setup = if ($root) { Join-Path $root 'tools/setup-hooks.ps1' } else { $null }
    if ($setup -and (Test-Path -LiteralPath $setup -PathType Leaf)) {
      . $setup
      # Write core.hooksPath only when the project dir is itself the repo root (an enclosing repo's
      # config is never touched), the path is unset or already .githooks (a custom one is kept), and
      # .githooks/commit-msg exists. Otherwise skip and say why.
      $top = "$(& git -C $root rev-parse --show-toplevel 2>$null)".Trim()
      $prefix = "$(& git -C $root rev-parse --show-prefix 2>$null)".Trim()
      $path = ''
      $why = ''
      if (-not $top -or $prefix) {
        $why = Get-Note 'session-greeting' 'githooks-elsewhere'
      } else {
        $path = "$(& git -C $top config --get core.hooksPath 2>$null)".Trim()
        if ($path -and $path -ne '.githooks') {
          $why = Get-Note 'session-greeting' 'githooks-kept'
        } elseif (-not (Test-Path -LiteralPath (Join-Path $top '.githooks/commit-msg') -PathType Leaf)) {
          $why = Get-Note 'session-greeting' 'githooks-missing'
        } elseif ($path -ne '.githooks') {
          $null = Set-HooksPath -RepoRoot $top
          $path = "$(& git -C $top config --get core.hooksPath 2>$null)".Trim()
        }
      }
      $state = @{}
      foreach ($name in @('commit-msg', 'pre-commit')) {
        $armed = $top -and $path -eq '.githooks' -and (Test-Path -LiteralPath (Join-Path $top ".githooks/$name") -PathType Leaf)
        $state[$name] = if ($armed) { 'armed' } else { 'not armed' }
      }
      $note = Get-Note 'session-greeting' 'githooks'
      if ($note) {
        $text = Fill $note @{ commitMsg = $state['commit-msg']; preCommit = $state['pre-commit'] }
        if ($why) { $text = "$text $why" }
        $lines += $text
      }
    }
  } catch { }
  $seats = Read-Seats $root

  # Each check stands alone: one that throws on an odd seats.json drops only itself.
  try {
    if ($seats) {
      $orch = Get-Family $seats.roles.orchestrator.model
      $hardOrch = $null
      $hardAwards = Get-HardAwards $seats
      if ($hardAwards -and $hardAwards.PSObject.Properties['orchestrator']) {
        $hardOrch = Get-Family $hardAwards.orchestrator.model
      }
      $allowed = @($orch, $hardOrch) | Where-Object { $_ }
      $session = Get-Family $payload.model
      if (-not $orch) {
        # No orchestrator seat to compare with.
      } elseif (-not $session) {
        $lines += Get-Note 'session-greeting' 'unchecked'
      } elseif ($allowed -cnotcontains $session) {
        $shown = if ($hardOrch) { "$orch, or $hardOrch on a hard run" } else { $orch }
        $lines += Fill (Get-Note 'session-greeting' 'model') @{ model = $payload.model; seats = $shown }
      }
    }
  } catch { }

  if ($env:CLAUDE_CODE_EFFORT_LEVEL) { $lines += Fill (Get-Note 'session-greeting' 'env') @{ name = 'CLAUDE_CODE_EFFORT_LEVEL' } }
  if ($env:CLAUDE_CODE_SUBAGENT_MODEL_FORCE -eq '1') { $lines += Fill (Get-Note 'session-greeting' 'env') @{ name = 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1' } }

  try {
    if ($seats -and $root) {
      $cap = Get-LowestCap $root
      if ($cap -ge 0) {
        # The first seat, roles then hard awards, whose effort is above the cap.
        $candidates = @($seats.roles.PSObject.Properties | ForEach-Object { @{ label = $_.Name; effort = $_.Value.effort } })
        $hardAwards = Get-HardAwards $seats
        if ($hardAwards) {
          $candidates += @($hardAwards.PSObject.Properties | ForEach-Object { @{ label = "$($_.Name) hard"; effort = $_.Value.effort } })
        }
        $found = $null
        foreach ($c in $candidates) {
          if (-not $found -and $EFFORTS.IndexOf([string]$c.effort) -gt $cap) { $found = $c }
        }
        if ($found) {
          $lines += Fill (Get-Note 'session-greeting' 'cap') @{ cap = $EFFORTS[$cap]; role = $found.label; effort = $found.effort }
        }
      }
    }
  } catch { }

  try {
    if ($root -and (Test-Path -LiteralPath (Join-Path $root '.run_state/hard') -PathType Leaf)) {
      $lines += Get-Note 'session-greeting' 'marker'
    }
  } catch { }

  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'SessionStart'; additionalContext = (@($lines | Where-Object { $_ }) -join ' ') } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
  exit 0
} catch {
  exit 0
}
