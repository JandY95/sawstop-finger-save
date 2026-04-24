param(
  [string]$Branch = "",

  [switch]$SkipTest,

  [switch]$SkipStatus,

  [switch]$ForceDelete,

  [switch]$AllowDirty
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

$CleanupScript = Join-Path $SourceCore "scripts/post-merge-cleanup.ps1"

if (-not (Test-Path $CleanupScript)) {
  throw "Missing post-merge cleanup script: $CleanupScript"
}

if ($Branch) {
  & $CleanupScript `
    -Repo $ProjectRoot `
    -Branch $Branch `
    -SkipTest:$($SkipTest.IsPresent) `
    -SkipStatus:$($SkipStatus.IsPresent) `
    -ForceDelete:$($ForceDelete.IsPresent) `
    -AllowDirty:$($AllowDirty.IsPresent)
} else {
  & $CleanupScript `
    -Repo $ProjectRoot `
    -SkipTest:$($SkipTest.IsPresent) `
    -SkipStatus:$($SkipStatus.IsPresent) `
    -ForceDelete:$($ForceDelete.IsPresent) `
    -AllowDirty:$($AllowDirty.IsPresent)
}

if ($LASTEXITCODE -ne 0) {
  throw "Project post-merge cleanup failed."
}
