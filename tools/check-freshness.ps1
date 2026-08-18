# check-freshness: read-only staleness + overlap check, shared by the owner-review
# path (README.md) and the build-session path (.claude/commands/build.md step 0,
# .claude/commands/realign.md). Rationale: the governance repo's DESIGN.md § "Hazards from
# the classification report: disposition" (items 10-11); the incident history behind this failure mode
# lives in the wedding-scavenger-hunt repo's own DESIGN.md, not duplicated here.
#
# Pure check, no side effects on the working tree: it runs read-only git commands
# only (fetch, rev-list --count, merge-base, diff --name-only); it never runs pull,
# merge, checkout, or reset.
#
# Single-homed constants and helpers: the carve-out list and MAX_DRIFT_COMMITS
# threshold are defined ONCE, in this file, and .claude/commands/realign.md consumes them
# from here (the realign command invokes this file's own CLI rather than reimplementing
# the list), so nothing else can quietly disagree about what counts as a hard collision.
# Do not copy $CARVE_OUT_PATHS, $MAX_DRIFT_COMMITS, Test-CarvedOut, or
# Get-OverlapFiles into another file; extend them here.
param(
  # Explicit file list to check for overlap against the drift range (an
  # issue's Touches list, or a wave's combined Touches), as one
  # comma-separated string, e.g. -Touches "src/app.js,src/widgets/feed.js".
  # A single CLI token, not a PowerShell array literal: `powershell -File`
  # passes -File arguments through as literal strings and does not
  # re-tokenize a comma-joined value into an array the way the language
  # parser does inside a script, so an [string[]] param here would silently
  # bind the whole "a,b,c" token as ONE element. Split it ourselves below.
  # When omitted, the branch's own changes since its fork point from
  # the default branch are used instead (git diff --name-only <merge-base>), so a
  # bare `check-freshness.ps1` with no arguments still gives a meaningful
  # overlap answer for "what has THIS session changed."
  [string]$Touches
)

# ---- Single-homed constants -------------------------------------------------

. (Join-Path $PSScriptRoot 'repo-profile-core.ps1')
$DefaultBranch = Get-RepoProfileValue -Field 'defaultBranch'
$RemoteDefault = "origin/$DefaultBranch"

# MAX_DRIFT_COMMITS: the single source of truth for "how many commits behind
# the default branch is tolerable before the sheer commit count becomes a hard
# resync trigger on its own, even with no detected file overlap." Documented
# HERE ONLY: no other file may also define this (a single-owned fact has exactly
# one owner).
$MAX_DRIFT_COMMITS = 10

# CARVE_OUT_PATHS (append-only): paths whose overlap with the drift range never
# counts as a hard resync/collision trigger, because two writers both appending
# to them in the same drift window cannot corrupt each other's entries. Only
# BUILDLOG.md qualifies today; governance files (standards/, agents/, DESIGN.md,
# .claude/, etc.) are deliberately NOT carved out, since they can carry real
# behavioral drift an overlap must still flag.
$CARVE_OUT_PATHS = @('BUILDLOG.md')

# Test-CarvedOut -- true when $RelativePath is on the append-only carve-out
# list above (exact match; paths are compared as git reports them, i.e.
# repo-root-relative with forward slashes).
function Test-CarvedOut {
  param([string]$RelativePath)
  return ($CARVE_OUT_PATHS -contains $RelativePath)
}

# Get-OverlapFiles -- the paths present in BOTH $DriftFiles and $TouchFiles,
# excluding anything Test-CarvedOut accepts. Both inputs may contain blanks,
# duplicates, or be empty arrays/$null; all are handled (the array/collection
# edges: empty list, duplicates).
function Get-OverlapFiles {
  param(
    [string[]]$DriftFiles,
    [string[]]$TouchFiles
  )
  $drift = @($DriftFiles | Where-Object { $_ })
  $touch = @($TouchFiles | Where-Object { $_ } | Select-Object -Unique)
  $overlap = @()
  foreach ($t in $touch) {
    if (($drift -contains $t) -and (-not (Test-CarvedOut $t))) {
      $overlap += $t
    }
  }
  return $overlap
}

# ---- Executable body --------------------------------------------------------
# Runs only when this file is invoked directly (`-File tools/check-freshness.ps1`
# or `& tools/check-freshness.ps1`), never when another script dot-sources it
# just to reuse the constants/functions above ($MyInvocation.InvocationName is
# literally '.' during a dot-source).
if ($MyInvocation.InvocationName -ne '.') {
  # Fail closed on fetch failure: without a fresh fetch the script cannot know
  # the true remote state, and a confident "up to date" while offline is
  # exactly the false signal this script exists to prevent.
  & git fetch --quiet origin 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Output 'could not verify freshness: git fetch failed (offline?). This checkout may be stale, reconnect and re-run before trusting it.'
    exit 1
  }

  $counts = "$(& git rev-list --left-right --count "$RemoteDefault...HEAD" 2>$null)".Trim()
  if (-not $counts) {
    [Console]::Error.WriteLine("check-freshness: could not compare against $RemoteDefault. Run this inside the repo; if it has never fetched, run: git fetch origin")
    exit 1
  }

  # rev-list --left-right --count <remote>...HEAD prints "<behind> <ahead>":
  # left = commits only on the remote default branch (you are behind by these), right =
  # commits only on HEAD (you are ahead by these). HEAD (not the local branch
  # ref) is intentional: in the primary checkout on the default branch they are the same
  # thing, and on any other checked-out branch (a build worktree) drift
  # against the remote default branch is still the signal the reader needs.
  $parts = $counts -split '\s+'
  $behind = [int]$parts[0]
  $ahead = [int]$parts[1]

  # Determine the touch-file list: explicit -Touches wins; otherwise fall back
  # to this branch's own changes since it forked from the remote default branch
  # (covers committed AND uncommitted changes on the branch, a session mid-run may
  # not have committed yet).
  $mergeBase = "$(& git merge-base $RemoteDefault HEAD 2>$null)".Trim()
  $explicitTouches = @()
  if ($Touches) {
    $explicitTouches = @($Touches -split ',\s*' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  }
  # NOTE: capture git's line-per-file output directly as an array (no
  # "$(...)" string-interpolation wrapper): wrapping a multi-line command
  # substitution in a double-quoted string joins its lines with $OFS (a
  # single space) before any -split runs, silently collapsing e.g.
  # "a.js" + "b.js" into one "a.js b.js" element. Assigning `& git ...`
  # directly keeps each output line as its own array element.
  if ($explicitTouches.Count -gt 0) {
    $touchFiles = $explicitTouches
  } elseif ($mergeBase) {
    $touchFiles = @(& git diff --name-only $mergeBase 2>$null | Where-Object { $_ })
  } else {
    $touchFiles = @()
  }

  # Drift files: everything the remote default branch changed since this branch's fork
  # point: the "branch-point..remote-default" range the issue names.
  $driftFiles = @()
  if ($mergeBase) {
    $driftFiles = @(& git diff --name-only $mergeBase $RemoteDefault 2>$null | Where-Object { $_ })
  }

  $overlap = @(Get-OverlapFiles -DriftFiles $driftFiles -TouchFiles $touchFiles)

  # Overlap is the load-bearing signal: one touched file the remote default branch
  # also rewrote is a hard trigger regardless of commit count.
  if ($overlap.Count -gt 0) {
    foreach ($f in $overlap) {
      Write-Output "OVERLAP: $f changed on $RemoteDefault since this branch forked, AND is in the touched-file list, resync required regardless of commit count."
    }
    exit 1
  }

  if ($behind -gt 0) {
    # Always "commits behind", even for 1: this phrase is depended on by
    # README.md and by other consumers that grep for it, so it is never reworded.
    Write-Output "$behind commits behind $RemoteDefault, resync (git pull, or re-fetch this worktree's base) before trusting this checkout."
    if ($ahead -gt 0) {
      Write-Output "(Also $ahead local commit(s) $RemoteDefault does not have.)"
    }
    if ($behind -gt $MAX_DRIFT_COMMITS) {
      Write-Output "$behind exceeds MAX_DRIFT_COMMITS ($MAX_DRIFT_COMMITS): the commit count alone is now a hard trigger, independent of the overlap check above."
    }
    exit 1
  }

  Write-Output "up to date: 0 commits behind $RemoteDefault."
  exit 0
}
