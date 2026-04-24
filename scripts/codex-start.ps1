param(
  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$CodexArgs
)

$ErrorActionPreference = 'Stop'
node scripts/os-session-start.js
if (Get-Command codex -ErrorAction SilentlyContinue) {
  if ($CodexArgs) {
    & codex @CodexArgs
  } else {
    & codex
  }
} else {
  Write-Host 'codex command not found. Stage check completed only.'
}
