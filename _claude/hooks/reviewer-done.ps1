# reviewer-done: a PostToolUse hook on Agent. When an agent whose description starts with the role
# tag of a reviewer role ([<role>], optionally "hard") returns, it adds a note the model reads next to
# the result. The reviewer roles are the seats.json roles whose agent is "reviewer". It never blocks.
# A background launch has not returned yet, so it gets no note (spawn-check denies a reviewer spawn
# that is not in the foreground). The project root is CLAUDE_PROJECT_DIR, else the input's cwd.
# Any problem prints nothing.
$ErrorActionPreference = 'Stop'

try {
  . (Join-Path $PSScriptRoot 'hook-core.ps1')
  $payload = (Read-Stdin) | ConvertFrom-Json
  if ($null -eq $payload) { exit 0 }
  $tag = Get-RoleTag $payload.tool_input.description
  if ($null -eq $tag) { exit 0 }
  $seats = Read-Seats (Get-ProjectRoot $payload)
  if ((Get-ReviewerRoles $seats) -cnotcontains $tag.Role) { exit 0 }
  if ("$($payload.tool_response.status)" -eq 'async_launched') { exit 0 }
  $note = Get-Note 'reviewer-done'
  if (-not $note) { exit 0 }
  $out = [ordered]@{ hookSpecificOutput = [ordered]@{
      hookEventName = 'PostToolUse'; additionalContext = (Fill $note @{ role = $tag.Role }) } }
  Write-Output ($out | ConvertTo-Json -Compress -Depth 4)
  exit 0
} catch {
  exit 0
}
