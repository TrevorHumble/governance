# tools/file-claim-core.ps1: the file-claim and size-rule decisions defined
# in standards/issue-standards.md section "The file claim and the size rule"
# (the single home of the rule's substance; this module mechanizes it and
# must never diverge from it). Dot-source this file; do not run it directly
# (mirrors the -core.ps1 convention of tools/issue-core.ps1).
#
# Windows PowerShell 5.1-compatible: no ternary, no ??, no &&, no ||.

# ConvertFrom-ActiveLabel -- parse one label name of the claim form
# active-<N>-YYYYMMDD-HHMM (timestamp UTC, minute precision). Returns
# @{ IssueNumber; Timestamp } with Timestamp a UTC [datetime], or $null for
# anything that is not a well-formed claim label (wrong shape, or a
# calendar-impossible date like month 13): a malformed label never grants a
# hold, per the standard's "live (non-stale, well-formed)" wording.
function ConvertFrom-ActiveLabel {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Label
  )
  $m = [regex]::Match($Label, '^active-([0-9]+)-([0-9]{8})-([0-9]{4})$')
  if (-not $m.Success) { return $null }
  $stampText = $m.Groups[2].Value + '-' + $m.Groups[3].Value
  $stamp = [datetime]::MinValue
  $styles = [System.Globalization.DateTimeStyles]::AssumeUniversal -bor `
    [System.Globalization.DateTimeStyles]::AdjustToUniversal
  $ok = [datetime]::TryParseExact(
    $stampText, 'yyyyMMdd-HHmm',
    [System.Globalization.CultureInfo]::InvariantCulture,
    $styles, [ref]$stamp)
  if (-not $ok) { return $null }
  return [pscustomobject]@{
    IssueNumber = [int]$m.Groups[1].Value
    Timestamp   = $stamp
  }
}

# Test-ClaimStale -- the release rule's staleness fallback.
function Test-ClaimStale {
  param(
    [Parameter(Mandatory = $true)] [datetime]$Timestamp,
    [Parameter(Mandatory = $true)] [datetime]$NowUtc
  )
  return (($NowUtc - $Timestamp).TotalHours -gt 36)
}

# Get-LiveClaim -- the one live claim an issue holds, or $null. An issue
# object carries Number (int) and Labels (string array). A label carried by
# the wrong issue grants nothing (per-run by construction), and a stamp
# more than an hour in the future grants nothing either: a mis-zoned local
# stamp would otherwise outlive the release promise by its skew.
function Get-LiveClaim {
  param(
    [Parameter(Mandatory = $true)] $Issue,
    [Parameter(Mandatory = $true)] [datetime]$NowUtc
  )
  $best = $null
  foreach ($label in @($Issue.Labels)) {
    if ($null -eq $label) { continue }
    $claim = ConvertFrom-ActiveLabel -Label ([string]$label)
    if ($null -eq $claim) { continue }
    if ($claim.IssueNumber -ne [int]$Issue.Number) { continue }
    if (Test-ClaimStale -Timestamp $claim.Timestamp -NowUtc $NowUtc) { continue }
    if (($claim.Timestamp - $NowUtc).TotalHours -gt 1) { continue }
    if ($null -eq $best) { $best = $claim }
    elseif ($claim.Timestamp -gt $best.Timestamp) { $best = $claim }
  }
  return $best
}

# ConvertFrom-TouchesLine -- the file set a Touches line claims, in
# canonical git path form (backslashes normalized to forward slashes, per
# the standard's canonical-form rule). A second, plainer Touches split
# lives in tools/check-freshness.ps1 (explicit -Touches input, caller-
# supplied rather than issue-body text); a change to either parse belongs
# in both.
function ConvertFrom-TouchesLine {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Value
  )
  $result = New-Object System.Collections.Generic.List[string]
  foreach ($piece in ($Value -split ',')) {
    $p = $piece.Trim()
    $p = [regex]::Replace($p, '\s*\([^)]*\)\s*$', '')
    $p = $p.Trim().Trim('`').Trim().Replace('\', '/')
    if ($p) { $result.Add($p) }
  }
  return @($result)
}

# Get-FileHolder -- which open issue holds a file right now, or $null when
# the file is free. An issue holds a file when its Touches set names the
# path (ordinal comparison, exact) and it carries a live claim per
# Get-LiveClaim. $ExcludeIssue is the acting issue's own number: a run's own
# claim never makes a file "held by another run". When two issues both hold
# the file (the double-claim race), the one that yields under
# Resolve-DoubleClaimYielder is skipped and the survivor is the holder.
function Get-FileHolder {
  param(
    [Parameter(Mandatory = $true)] $Issues,
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [datetime]$NowUtc,
    [int]$ExcludeIssue = 0
  )
  $holders = New-Object System.Collections.Generic.List[object]
  foreach ($issue in @($Issues)) {
    if ($null -eq $issue) { continue }
    if ([int]$issue.Number -eq $ExcludeIssue) { continue }
    $touches = @($issue.Touches)
    if (-not ($touches -ccontains $Path)) { continue }
    $claim = Get-LiveClaim -Issue $issue -NowUtc $NowUtc
    if ($null -eq $claim) { continue }
    $holders.Add($claim)
  }
  if ($holders.Count -eq 0) { return $null }
  $survivor = $holders[0]
  for ($i = 1; $i -lt $holders.Count; $i++) {
    $yielder = Resolve-DoubleClaimYielder -ClaimA $survivor -ClaimB $holders[$i]
    if ($yielder -eq $survivor.IssueNumber) { $survivor = $holders[$i] }
  }
  return $survivor.IssueNumber
}

# Resolve-SizeRuleBranch -- the four-branch size-rule decision, numbered as
# the standard numbers them. $ChangeSize is the larger of insertions or
# deletions in the one file (the review-size bound's unit).
function Resolve-SizeRuleBranch {
  param(
    [Parameter(Mandatory = $true)] [int]$ChangeSize,
    [Parameter(Mandatory = $true)] [bool]$Held
  )
  if ($ChangeSize -le 10) {
    if ($Held) { return 1 }
    return 2
  }
  if ($Held) { return 4 }
  return 3
}

# Resolve-DoubleClaimYielder -- returns the issue number that yields a
# double-claim.
function Resolve-DoubleClaimYielder {
  param(
    [Parameter(Mandatory = $true)] $ClaimA,
    [Parameter(Mandatory = $true)] $ClaimB
  )
  if ($ClaimA.Timestamp -gt $ClaimB.Timestamp) { return [int]$ClaimA.IssueNumber }
  if ($ClaimB.Timestamp -gt $ClaimA.Timestamp) { return [int]$ClaimB.IssueNumber }
  if ([int]$ClaimA.IssueNumber -gt [int]$ClaimB.IssueNumber) { return [int]$ClaimA.IssueNumber }
  return [int]$ClaimB.IssueNumber
}
