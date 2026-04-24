param(
  [switch]$Json
)

$ErrorActionPreference = "Stop"

$ProjectPath = Resolve-Path (Join-Path $PSScriptRoot "..")
$ProjectRoot = $ProjectPath.Path
$StatePath = Join-Path $ProjectRoot ".project-state.json"

if (-not (Test-Path $StatePath)) {
  throw "Missing .project-state.json. Run project sync first."
}

$State = Get-Content $StatePath -Raw | ConvertFrom-Json
$SourceCore = $State.osSync.sourceCore

if (-not $SourceCore) {
  $SourceCore = $State.engineAssetsSync.sourceCore
}

if (-not $SourceCore) {
  throw "Missing sourceCore in .project-state.json."
}

$StatusScript = Join-Path $SourceCore "scripts/operator-status.js"

if (-not (Test-Path $StatusScript)) {
  throw "Missing operator status script: $StatusScript"
}

if ($Json) {
  node $StatusScript --project $ProjectRoot --json true
} else {
  node $StatusScript --project $ProjectRoot
}
