# Re-pull Impeccable from a release tag, byte for byte. Run from the repo root:
#   pwsh tools/update-impeccable.ps1 -Tag skill-v4.8.0 -Commit <full commit sha>
# -Repo defaults to upstream; only a test points it elsewhere.
# -Commit is optional. When given, the pulled commit must match it or nothing changes.
# Then edit .claude/skills/impeccable/NOTICE.md (version and commit), run the checks,
# and open the PR. This is the only update step: do not use `npx impeccable update`,
# which would overwrite the reviewed copy.
param(
  [Parameter(Mandatory)][string]$Tag,
  [string]$Commit,
  [string]$Repo = 'https://github.com/pbakaus/impeccable.git'
)
$ErrorActionPreference = 'Stop'
$Dest = Join-Path (git rev-parse --show-toplevel) '.claude/skills/impeccable'
# Our own files in the folder; the pull leaves these alone (LICENSE is refreshed below).
$Mine = @('LICENSE', 'NOTICE.md')
$Work = Join-Path ([IO.Path]::GetTempPath()) ("impeccable-" + [guid]::NewGuid())
try {
  # No checkout yet. info/attributes outranks upstream's own .gitattributes, so
  # `* -text` makes the checkout hold the exact bytes git stores (upstream marks
  # some files, such as .cmd, to be written with CRLF).
  git -c core.autocrlf=false clone --quiet --no-checkout --depth 1 --branch $Tag $Repo $Work
  if ($LASTEXITCODE -ne 0) { throw "Cannot clone $Tag from $Repo." }
  $Head = (git -C $Work rev-parse HEAD).Trim()
  if ($Commit -and ($Head -ne $Commit.Trim().ToLowerInvariant())) {
    throw "Tag $Tag is commit $Head, not the $Commit you named. Nothing was changed."
  }
  New-Item -ItemType Directory -Force (Join-Path $Work '.git/info') | Out-Null
  Set-Content (Join-Path $Work '.git/info/attributes') '* -text'
  git -C $Work -c core.autocrlf=false checkout --quiet HEAD
  $Src = Join-Path $Work '.claude/skills/impeccable'
  if (-not (Test-Path $Src)) { throw "$Tag has no .claude/skills/impeccable folder." }
  # A bundled engine would run with no checksum from the launcher. Refuse it.
  if (Test-Path (Join-Path $Src 'scripts/bin')) {
    throw "$Tag ships scripts/bin. Its engine would run with no checksum. Nothing was changed."
  }
  Get-ChildItem $Dest -Recurse -File | Where-Object { $Mine -notcontains $_.FullName.Substring($Dest.Length + 1) } | Remove-Item
  Copy-Item (Join-Path $Src '*') $Dest -Recurse -Force
  Copy-Item (Join-Path $Work 'LICENSE') (Join-Path $Dest 'LICENSE') -Force
  git add -A $Dest
  git update-index --chmod=+x '.claude/skills/impeccable/scripts/impeccable'
  Write-Host "Impeccable $Tag pulled (commit $Head). Update NOTICE.md to match."
} finally {
  if (Test-Path $Work) { Remove-Item $Work -Recurse -Force }
}
