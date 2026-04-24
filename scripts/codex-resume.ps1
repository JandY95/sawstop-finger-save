param(
  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$CodexArgs
)

$ErrorActionPreference = 'Stop'
node scripts/os-session-start.js
$handoff = 'docs/harness/handoff/latest.md'
if (Test-Path $handoff) {
  Write-Host 'Latest handoff:'
  Get-Content $handoff
}
if (Get-Command codex -ErrorAction SilentlyContinue) {
  if ($CodexArgs) {
    & codex @CodexArgs
  } else {
    & codex
  }
} else {
  Write-Host 'codex command not found. Resume context prepared only.'
}
