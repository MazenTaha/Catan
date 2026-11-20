param(
    [string]$EditorPath = $env:UNREAL_EDITOR,
    [string]$ProjectPath,
    [ValidateSet('Editor', 'Game')][string]$Target = 'Editor',
    # Copy the canonical runtime source into the converted project without compiling.
    [switch]$SyncOnly
)
$ErrorActionPreference = 'Stop'
if (-not $EditorPath -or -not (Test-Path -LiteralPath $EditorPath)) {
    throw 'Pass -EditorPath with the path to UnrealEditor.exe, or set UNREAL_EDITOR.'
}
if (-not $ProjectPath) {
    $ProjectPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'unreal 5.8/CatanNight.uproject'
}
$ProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$nativeProjectDir = Split-Path -Parent $ProjectPath
# Keep runtime source in one authoring directory; the converted editor project consumes a copy.
if ($nativeProjectDir -ne $PSScriptRoot) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Source') -Destination $nativeProjectDir -Recurse -Force
    $pluginDir = Join-Path $nativeProjectDir 'Plugins/CatanAnimation'
    New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Plugins/CatanAnimation/Source') -Destination $pluginDir -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Plugins/CatanAnimation/CatanAnimation.uplugin') -Destination $pluginDir -Force
}
if ($SyncOnly) { return }
$engineRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $EditorPath)))
$buildScript = Join-Path $engineRoot 'Engine/Build/BatchFiles/Build.bat'
$nativeTarget = if ($Target -eq 'Editor') { 'CatanNightEditor' } else { 'CatanNight' }
& $buildScript $nativeTarget Win64 Development "-Project=$ProjectPath" -WaitMutex -NoHotReloadFromIDE -MaxParallelActions=2
if ($LASTEXITCODE -ne 0) { throw "Native $Target build failed with code $LASTEXITCODE" }
