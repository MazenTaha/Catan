param(
    [string]$EditorPath = $env:UNREAL_EDITOR,
    [string]$ProjectPath,
    [ValidateSet('Shipping', 'Development')][string]$Configuration = 'Shipping',
    [string]$OutputDir
)
# Packages the Catan Night Windows app: the table map, whose game mode runs the complete web game
# (menu, 2D board, bots, hot-seat, online rooms, 3D walk) in Unreal's built-in browser. Close the
# editor first: cooking loads the project, and both together can exhaust memory on this PC.
$ErrorActionPreference = 'Stop'
if (-not $EditorPath -or -not (Test-Path -LiteralPath $EditorPath)) {
    throw 'Pass -EditorPath with the path to UnrealEditor.exe, or set UNREAL_EDITOR.'
}
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $ProjectPath) { $ProjectPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'unreal 5.8/CatanNight.uproject' }
$ProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$projectDir = Split-Path -Parent $ProjectPath
if (-not $OutputDir) { $OutputDir = Join-Path $PSScriptRoot 'Packaged' }

& (Join-Path $PSScriptRoot 'build-native.ps1') -EditorPath $EditorPath -ProjectPath $ProjectPath -SyncOnly
Push-Location $repo
try {
    # A fresh web build and server bundle; CatanNight.Build.cs stages the folder as loose files.
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'The web build failed.' }
    node apps/unreal/stage-web-game.mjs --project $projectDir
    if ($LASTEXITCODE -ne 0) { throw 'Staging the web game failed.' }
} finally { Pop-Location }

$engineRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $EditorPath)))
$uat = Join-Path $engineRoot 'Engine/Build/BatchFiles/RunUAT.bat'
& $uat BuildCookRun "-project=$ProjectPath" -platform=Win64 "-clientconfig=$Configuration" `
    -build -cook -stage -pak -archive "-archivedirectory=$OutputDir" `
    -map=/Game/CatanNight/Maps/Table -nop4 -utf8output -unattended -nocompileeditor
if ($LASTEXITCODE -ne 0) { throw "Packaging failed with code $LASTEXITCODE" }
Write-Host "Packaged: $(Join-Path $OutputDir 'Windows/CatanNight.exe')"
