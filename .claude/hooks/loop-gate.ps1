# loop-gate: a Stop hook. During an explicit timed autonomous run it BLOCKS the
# model from ending its turn until the clock budget is spent, mechanically
# enforcing the never-stop loop (you cannot quit early). Constraint, stated flat:
# the release condition is wall-clock TIME, never a verdict file a step might
# fail to write. Provenance: ported from the wedding-scavenger-hunt repo's
# governance history, not a DESIGN.md decision made in this repo.
#
# SAFETY (must never trap a session, must never burn tokens in a tight loop): each
# release path (no active run, emergency STOP, budget spent, tight-loop churn,
# runaway turn cap, any error) is a one-line comment at its own exit-0 branch
# below. Two constraints not visible at any single branch: this hook is
# project-scoped (fires only for sessions rooted in this repo), and its
# turn/churn counters assume a single session per run (the time bound alone is
# concurrency-safe).
$ErrorActionPreference = 'SilentlyContinue'
$MIN_TURN  = 25   # seconds; a stop sooner than this after a block = no real work
$CHURN_MAX = 6    # consecutive empty turns tolerated before releasing
try {
  $raw = [Console]::In.ReadToEnd()
  try { $j = $raw | ConvertFrom-Json } catch { exit 0 }   # bad stdin -> fail open

  $top = (& git rev-parse --show-toplevel 2>$null)
  if (-not $top) { exit 0 }                               # not in a repo -> allow (project-scoped)
  $rs   = Join-Path $top '.run_state'
  $runf = Join-Path $rs 'run.json'
  if (-not (Test-Path $runf)) { exit 0 }                  # no active run -> allow
  if (Test-Path (Join-Path $rs 'STOP')) { exit 0 }        # emergency brake -> allow

  $run = Get-Content $runf -Raw | ConvertFrom-Json
  $now = [long][double]::Parse((Get-Date -UFormat %s))
  $end = [long]$run.end_epoch
  if ($now -ge $end) { Remove-Item $runf -Force; exit 0 }  # budget spent -> allow + disarm

  # Tight-loop / runaway protection (release without disarming; time still governs).
  $last  = [long]$run.last_block
  $churn = [int]$run.churn
  if ($j.stop_hook_active) {
    if ($last -gt 0 -and ($now - $last) -lt $MIN_TURN) {
      $churn++
      if ($churn -ge $CHURN_MAX) { exit 0 }               # empty churn -> release
    } else {
      $churn = 0                                           # real work happened -> keep forcing
    }
  } else {
    $churn = 0
  }
  $iters = [int]$run.iters + 1
  $max   = [int]$run.max_iters
  if ($max -gt 0 -and $iters -gt $max) { exit 0 }          # ultimate breaker -> release (no disarm)

  # Persist counters, then block the stop.
  $run.iters      = $iters
  $run.churn      = $churn
  $run.last_block = $now
  [IO.File]::WriteAllText($runf, ($run | ConvertTo-Json -Compress))
  $left = [long][math]::Round(($end - $now) / 60)
  $reason = "loop-gate (forced never-stop): ~$left min remain in the autonomous run budget (turn $iters of $max). Do NOT stop. Continue the loop -- pick the next highest-value action from the goals, or run the Done-Early Cascade (holistic review -> revisit blockers -> deep research -> raise the bar -> file issues). Genuine emergency stop only: create .run_state/STOP."
  Write-Output (@{ decision = 'block'; reason = $reason } | ConvertTo-Json -Compress)
  exit 0
} catch {
  exit 0   # fail OPEN: never trap on an error
}
