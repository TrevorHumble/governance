# apply-branch-protection.ps1: apply GitHub branch protection to the default branch.
#
# WHAT: PUTs GitHub branch protection onto the target branch requiring a pull
# request, the repo's declared status checks, and required_status_checks.strict
# fixed at $false (not a parameter). Owner's dates and rationale: see the
# `strict = $false` line below, and the governance repo's DESIGN.md §
# "Branch-protection strictness".
#
# Required checks are a parameter, not a hardcoded list: pass -RequiredChecks, or
# let it default to repo-profile.json's ciCheckNames field. A required context
# that never matches an actual check-run name would permanently block every
# merge, so keep this list in sync with the repo's real CI job names, not names
# guessed from workflow YAML.
#
# required_approving_review_count stays 0 by default (a solo-maintainer repo
# cannot approve their own PR). Rationale: the governance repo's DESIGN.md §
# "Lean review process rationale".
#
# Windows PowerShell 5.1-compatible: no ternary, no ??, no &&, no ||.
param(
  [string]$Branch,
  # Comma-separated string, not a PowerShell array literal: `powershell -File`
  # passes -File arguments through as literal strings and does not re-tokenize
  # a comma-joined value into an array, so a [string[]] param here would
  # silently bind the whole "a,b,c" token as ONE element (the same gotcha
  # tools/check-freshness.ps1's -Touches param avoids the same way). Split it
  # ourselves below.
  [string]$RequiredChecks,
  [switch]$EmitPayload,
  # Offline seam extension (issue #17): write the payload to this path instead
  # of stdout, then exit before any network call. Requires -EmitPayload; see
  # the guard below.
  [string]$PayloadPath
)

# -PayloadPath without -EmitPayload is a caller mistake, not a silent
# fall-through to a live PUT: catch it before repo-slug resolution so nobody
# reaches a network call while expecting an offline dry run. Checked via
# ContainsKey, not truthiness: -PayloadPath '' is still a caller mistake, and
# this is the same emptiness contract the -EmitPayload branch below uses for
# the same parameter.
if ($PSBoundParameters.ContainsKey('PayloadPath') -and -not $EmitPayload) {
  [Console]::Error.WriteLine('apply-branch-protection: -PayloadPath requires -EmitPayload')
  exit 1
}

# Write-PayloadFile: the file's only payload-write site. Windows PowerShell
# 5.1's `Set-Content -Encoding utf8` emits a UTF-8 BOM, which GitHub's JSON
# parser rejects with a 400; this write never does. Do not add a second write
# expression here -- tests/apply-branch-protection.test.js asserts exactly
# one WriteAllText call.
function Write-PayloadFile {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$Json
  )
  # [System.IO.File]::WriteAllText resolves a relative path against the .NET
  # process directory, not PowerShell's current location; anchor it here.
  if (-not [System.IO.Path]::IsPathRooted($Path)) {
    $Path = Join-Path (Get-Location).ProviderPath $Path
  }
  try {
    [System.IO.File]::WriteAllText($Path, $Json, (New-Object System.Text.UTF8Encoding($false)))
  } catch {
    [Console]::Error.WriteLine("apply-branch-protection: failed to write payload to '$Path': $($_.Exception.Message)")
    exit 1
  }
}

# Resolve the gh path and the default branch/required-checks fallback from
# repo-profile.json, never hardcoded, so this tool works unmodified in any
# child repo that declares its own values.
. (Join-Path $PSScriptRoot 'repo-profile-core.ps1')
$gh = Get-RepoProfileValue -Field 'ghPath' -Default 'gh'

if (-not $Branch) {
  $Branch = Get-RepoProfileValue -Field 'defaultBranch'
}

# Slug resolution is deferred to the network path (just before the PUT) so that
# -EmitPayload never needs a resolvable repo or an authenticated `gh`: the
# slug is only used to build the PUT/read-back URLs below, never to build the
# emitted $json itself.

$requiredChecksList = @()
if ($RequiredChecks) {
  $requiredChecksList = @($RequiredChecks -split ',\s*' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
} else {
  $requiredChecksList = @(Get-RepoProfileValue -Field 'ciCheckNames' -Default @())
}

# restrictions must be present and explicitly null in the payload: GitHub's
# branch protection PUT replaces the whole object, and omitting a key is not
# the same as sending it as null. [ordered] preserves key order for readability;
# it has no effect on the JSON GitHub receives.
#
# checks (not contexts): GitHub's "Update branch protection" API marks
# required_status_checks.contexts as closing down in favor of `checks`, an
# array of {context, app_id} objects. app_id = -1 means "allow any app to set
# the status": the behavior-preserving equivalent of the old name-only
# contexts matching (omitting app_id would instead auto-select one specific
# app and could narrow which run satisfies the check).
$payload = [ordered]@{
  required_status_checks = [ordered]@{
    # strict=false: the owner turned up-to-date-before-merge off on 2026-07-17,
    # reconfirmed 2026-08-19; re-running this tool must not re-enable it. See
    # the governance repo's DESIGN.md § "Branch-protection strictness".
    strict = $false
    checks = @($requiredChecksList | ForEach-Object { [ordered]@{ context = $_; app_id = -1 } })
  }
  enforce_admins          = $true
  required_pull_request_reviews = [ordered]@{
    required_approving_review_count = 0
  }
  restrictions            = $null
}

$json = $payload | ConvertTo-Json -Depth 8
# ConvertTo-Json emits a null-valued key as `"restrictions": null` (it does not
# drop it), which is what the PUT needs: confirmed by inspecting $json below
# rather than assumed.
if ($json -notmatch '"restrictions"\s*:\s*null') {
  [Console]::Error.WriteLine('apply-branch-protection: built payload is missing "restrictions": null, refusing to send a payload that would not explicitly clear push restrictions')
  exit 1
}

# -EmitPayload is the offline-testable seam: print (or, with -PayloadPath,
# write to a file) the exact PUT body and exit before any network call, so CI
# can regression-guard the payload shape without live GitHub credentials.
if ($EmitPayload) {
  if ($PSBoundParameters.ContainsKey('PayloadPath')) {
    # An explicitly-passed empty string is a caller mistake, not "no path
    # given": treat it as an error rather than silently falling back to stdout.
    if (-not $PayloadPath) {
      [Console]::Error.WriteLine('apply-branch-protection: -PayloadPath requires a non-empty path')
      exit 1
    }
    Write-PayloadFile -Path $PayloadPath -Json $json
  } else {
    Write-Output $json
  }
  exit 0
}

# `gh repo view` fails clearly when run outside a resolvable repo, so this empty
# -slug guard is also the "not in a repo" guard: no separate git-repo check needed.
# Resolved only here, on the network path, so -EmitPayload above never needs it.
$slug = "$(& $gh repo view --json nameWithOwner -q .nameWithOwner 2>$null)".Trim()
if (-not $slug) { [Console]::Error.WriteLine('apply-branch-protection: could not resolve repo slug via gh repo view'); exit 1 }

# A temp file, not a pipe: piping into a native process risks a BOM under
# some caller $OutputEncoding settings; Write-PayloadFile's write avoids that.
# Measured evidence and the rejected $global:OutputEncoding design: issue #17.
$tmpPath = Join-Path ([System.IO.Path]::GetTempPath()) ('apply-branch-protection-' + [guid]::NewGuid().ToString('N') + '.json')
try {
  Write-PayloadFile -Path $tmpPath -Json $json
  & $gh api --method PUT "repos/$slug/branches/$Branch/protection" --input $tmpPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("apply-branch-protection: PUT failed (exit $LASTEXITCODE). See gh's message above.")
    exit 1
  }
} finally {
  if (Test-Path -LiteralPath $tmpPath) {
    Remove-Item -LiteralPath $tmpPath -Force -ErrorAction SilentlyContinue
  }
}

# The tool now both sends and reads required checks under `checks`: the PUT
# body above writes required_status_checks.checks, and GitHub echoes that
# same key back on read, so this --jq expression needs no field-name mapping.
# tools/governance-sync.ps1's Get-CiGateStatus is this read site's twin: it also
# reads required_status_checks.checks, so a GitHub field rename found here must
# be applied there too.
$readBack = & $gh api "repos/$slug/branches/$Branch/protection" --jq '{strict: .required_status_checks.strict, contexts: (.required_status_checks.checks | map(.context) | sort), approving_reviews: .required_pull_request_reviews.required_approving_review_count, enforce_admins: .enforce_admins.enabled}' 2>$null
if ($LASTEXITCODE -ne 0) {
  [Console]::Error.WriteLine("apply-branch-protection: applied protection but read-back failed (exit $LASTEXITCODE)")
  exit 1
}

Write-Output "branch protection applied to '$Branch' ($slug):"
Write-Output $readBack
