# issue-core.ps1: issue-number-keyed helpers for the commit-msg gate.
# Dot-source this file; do not run it directly.
# Windows PowerShell 5.1-compatible: no ternary, no ??, no &&, no ||.
# Self-contained: no dependency on any other tools/*.ps1 file.

# Resolve-IssueNumber: deterministic, two-source resolution. Returns an int > 0,
# or 0 if unresolvable.
#   1. Message first: (#\d+), or any of GitHub's 9 auto-close keywords
#      (close/closes/closed, fix/fixes/fixed, resolve/resolves/resolved)
#      followed by #\d+ (case-insensitive) -- the GitHub auto-close carrier.
#   2. Branch fallback: only an anchored mandatory-prefix token
#      (?:^|[-/])issue[-/](\d+)(?:$|[-/]), so 'enforce/v4-s1-audit-core' does NOT
#      resolve (no issue[-/] prefix) but 'feat/issue-46' resolves to 46; bare
#      numerals in version strings are never captured.
function Resolve-IssueNumber {
  param(
    [string]$Message,
    [string]$Branch
  )

  # --- message-first ---
  if ($Message) {
    if ($Message -match '(?i)(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)') {
      return [int]$Matches[1]
    }
    if ($Message -match '\(#(\d+)\)') {
      return [int]$Matches[1]
    }
  }

  # --- branch fallback ---
  if ($Branch) {
    if ($Branch -match '(?i)(?:^|[-/])issue[-/](\d+)(?:$|[-/])') {
      return [int]$Matches[1]
    }
  }

  return 0
}

# Test-StagedHasCode: $true if any staged path is CODE (anything not ending in
# .md/.markdown, case-insensitive; folder location such as docs/ does NOT
# exempt a path). Deletions are INCLUDED (no --diff-filter), so a commit that
# only deletes code files still counts as CODE. NUL-safe path handling guards
# against non-ASCII or space-containing paths.
function Test-StagedHasCode {
  # NUL-safe git output, kept inline (self-contained per the header) rather
  # than calling the shared tools/governance-sync-core.ps1 helper. No
  # -WorkingDirectory: runs against the invoking tree.
  # $ErrorActionPreference = 'Stop', function-scoped, is what makes a
  # genuine PowerShell error propagate instead of silently falling through
  # to "no code staged"; a git failure (nonzero exit) still yields empty
  # output and $false, unaffected. Full rationale, the fail-closed contract
  # this backs, and why 'Stop' is required here: the governance repo's
  # DESIGN.md § "NUL-safe git output: one home".
  $ErrorActionPreference = 'Stop'
  $outFile = $null
  $errFile = $null
  try {
    $outFile = [IO.Path]::GetTempFileName()
    $errFile = [IO.Path]::GetTempFileName()
    Start-Process -FilePath 'git' `
      -ArgumentList @('-c', 'core.quotepath=false', 'diff', '--cached', '--name-only', '-z') `
      -NoNewWindow -Wait -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    $z = [System.Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($outFile))
  } finally {
    if ($null -ne $outFile) { Remove-Item -LiteralPath $outFile -Force -ErrorAction SilentlyContinue }
    if ($null -ne $errFile) { Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue }
  }
  $lastNul = $z.LastIndexOf([char]0)
  $paths = @()
  if ($lastNul -ge 0) {
    $paths = @($z.Substring(0, $lastNul) -split "`0")
  }
  if (@($paths).Count -eq 0) { return $false }
  foreach ($p in $paths) {
    if ($p -notmatch '(?i)\.(md|markdown)$') { return $true }
  }
  return $false
}
