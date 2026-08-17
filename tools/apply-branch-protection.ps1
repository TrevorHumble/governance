# apply-branch-protection.ps1: require the default branch to be up to date before merge.
#
# WHAT: PUTs GitHub branch protection onto the target branch requiring a pull
# request, the repo's declared status checks, and required_status_checks.strict
# always true (not a parameter; see below).
#
# WHY: two PRs can each go green against an older default branch, then both merge
# close together. The second merge lands without ever running CI against the tree
# that includes the first merge's changes: the default branch ends up in a state CI
# never actually checked. `strict = true` closes that: a branch that has fallen
# behind must update and re-run CI before GitHub will allow the merge, serializing
# concurrent merges through CI instead of racing them. `strict` is always true --
# it is the whole point of the tool. See DESIGN.md § "Branch-protection strictness"
# for why this stays fixed rather than becoming a per-repo profile field: a repo
# that wants different behavior adds a profile field through a governance issue,
# not by editing its own copy of this script.
#
# Required checks are a parameter, not a hardcoded list: pass -RequiredChecks, or
# let it default to repo-profile.json's ciCheckNames field. A required context
# that never matches an actual check-run name would permanently block every
# merge, so keep this list in sync with the repo's real CI job names, not names
# guessed from workflow YAML.
#
# required_approving_review_count stays 0 by default: a solo-maintainer repo
# cannot have its owner approve their own PR, so requiring >= 1 would lock the
# owner out of merging their own work. CI plus review practice is the review
# gate here, not a human approval click; see DESIGN.md § "Lean review process
# rationale".
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
  [switch]$EmitPayload
)

# Resolve the gh path and the default branch/required-checks fallback from
# repo-profile.json, never hardcoded, so this tool works unmodified in any
# child repo that declares its own values.
. (Join-Path $PSScriptRoot 'repo-profile-core.ps1')
$gh = Get-RepoProfileValue -Field 'ghPath' -Default 'gh'

if (-not $Branch) {
  $Branch = Get-RepoProfileValue -Field 'defaultBranch' -Default 'main'
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
    strict = $true
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

# -EmitPayload is the offline-testable seam: print the exact PUT body and exit
# before any network call, so CI can regression-guard the payload shape
# without live GitHub credentials.
if ($EmitPayload) {
  Write-Output $json
  exit 0
}

# `gh repo view` fails clearly when run outside a resolvable repo, so this empty
# -slug guard is also the "not in a repo" guard: no separate git-repo check needed.
# Resolved only here, on the network path, so -EmitPayload above never needs it.
$slug = "$(& $gh repo view --json nameWithOwner -q .nameWithOwner 2>$null)".Trim()
if (-not $slug) { [Console]::Error.WriteLine('apply-branch-protection: could not resolve repo slug via gh repo view'); exit 1 }

$json | & $gh api --method PUT "repos/$slug/branches/$Branch/protection" --input - | Out-Null
if ($LASTEXITCODE -ne 0) {
  [Console]::Error.WriteLine("apply-branch-protection: PUT failed (exit $LASTEXITCODE). See gh's message above.")
  exit 1
}

# The tool now both sends and reads required checks under `checks`: the PUT
# body above writes required_status_checks.checks, and GitHub echoes that
# same key back on read, so this --jq expression needs no field-name mapping.
$readBack = & $gh api "repos/$slug/branches/$Branch/protection" --jq '{strict: .required_status_checks.strict, contexts: (.required_status_checks.checks | map(.context) | sort), approving_reviews: .required_pull_request_reviews.required_approving_review_count, enforce_admins: .enforce_admins.enabled}' 2>$null
if ($LASTEXITCODE -ne 0) {
  [Console]::Error.WriteLine("apply-branch-protection: applied protection but read-back failed (exit $LASTEXITCODE)")
  exit 1
}

Write-Output "branch protection applied to '$Branch' ($slug):"
Write-Output $readBack
