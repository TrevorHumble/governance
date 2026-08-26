# tools/note-check-core.ps1: the two mechanizable note pre-check decisions
# defined in agents/orchestrator.md section "No agent files its own issue"
# (rules 2 and 4): does a recorded owner decline suppress this note, and
# does an open issue already cover it. The match key is the note's
# normalized one-line substance; anything fuzzier than the comparisons
# stated on each function below is reviewer judgment, not mechanized (see
# WHAT-IT-CHECKS.md). Dot-source this file; do not run it directly (mirrors
# the -core.ps1 convention of tools/file-claim-core.ps1).
#
# Windows PowerShell 5.1-compatible: no ternary, no ??, no &&, no ||.

# ConvertTo-NormalizedSubstance -- the match key: case-folded,
# whitespace-collapsed, trimmed.
function ConvertTo-NormalizedSubstance {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Text
  )
  $t = $Text.ToLowerInvariant()
  $t = [regex]::Replace($t, '\s+', ' ')
  return $t.Trim()
}

# Test-DeclineMatch -- true when a recorded decline's substance field
# equals the note's normalized substance exactly. Suppression fires before
# any reviewer sees the note, so nothing looser than exact equality is
# safe: a containment match would let one decline silently swallow every
# note whose substance is a fragment of its line. $DeclineLines is the
# owner-declines.md content split into lines; only a list entry of the
# recorded shape (- <YYYY-MM-DD> - <substance> - <answer>) is a decline,
# so header prose and the file's own format template can never suppress
# anything. The substance match is greedy to the last separator, so a
# substance that itself contains " - " still parses; the answer is the
# final field.
function Test-DeclineMatch {
  param(
    [Parameter(Mandatory = $true)] $DeclineLines,
    [Parameter(Mandatory = $true)] [string]$Substance
  )
  $needle = ConvertTo-NormalizedSubstance -Text $Substance
  if (-not $needle) { return $false }
  foreach ($line in @($DeclineLines)) {
    if ($null -eq $line) { continue }
    $l = ([string]$line).Trim()
    $m = [regex]::Match($l, '^-\s+([0-9]{4}-[0-9]{2}-[0-9]{2})\s+-\s+(.+)\s+-\s+')
    if (-not $m.Success) { continue }
    $recorded = ConvertTo-NormalizedSubstance -Text $m.Groups[2].Value
    if ($recorded -eq $needle) { return $true }
  }
  return $false
}

# Find-CoveringIssue -- the number of an open issue that already covers the
# note; $null when none does. $Issues carries objects with Number, Title,
# Body. Two matches, each deliberately shaped: a title covers the note only
# on exact equality with the normalized substance (containment would point
# a note at any issue whose title happens to embed its words); a body's
# Touches line covers it when the whole substance is a fragment of that
# line, which fires only when the substance names just the file. A note
# that names a file among other words is not covered here; reviewer
# judgment handles what exact matching cannot (agents/reviewer-notes.md).
function Find-CoveringIssue {
  param(
    [Parameter(Mandatory = $true)] $Issues,
    [Parameter(Mandatory = $true)] [string]$Substance
  )
  $needle = ConvertTo-NormalizedSubstance -Text $Substance
  if (-not $needle) { return $null }
  foreach ($issue in @($Issues)) {
    if ($null -eq $issue) { continue }
    $title = ConvertTo-NormalizedSubstance -Text ([string]$issue.Title)
    if ($title -eq $needle) { return [int]$issue.Number }
    foreach ($line in (([string]$issue.Body) -split "`n")) {
      $l = $line.Trim()
      if ($l -notmatch '^Touches:') { continue }
      $norm = ConvertTo-NormalizedSubstance -Text $l
      if ($norm.Contains($needle)) { return [int]$issue.Number }
    }
  }
  return $null
}
