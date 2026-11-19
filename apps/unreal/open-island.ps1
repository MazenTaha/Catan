param(
    [string]$EditorPath = $env:UNREAL_EDITOR,
    [string]$ProjectPath,
    [switch]$GenerateIsland,
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
if (-not $ProjectPath) {
    $convertedProject = Join-Path (Split-Path -Parent $PSScriptRoot) 'unreal 5.8/CatanNight.uproject'
    $ProjectPath = if (Test-Path -LiteralPath $convertedProject) { $convertedProject } else { Join-Path $PSScriptRoot 'CatanNight.uproject' }
}
$scriptPath = Join-Path $PSScriptRoot 'Content/Python/build_island.py'
$sourcePath = Join-Path $PSScriptRoot 'SourceArt/Generated/island.glb'

if (-not $EditorPath) {
    $installedFile = Join-Path $env:ProgramData 'Epic/UnrealEngineLauncher/LauncherInstalled.dat'
    if (Test-Path -LiteralPath $installedFile) {
        $installed = Get-Content -LiteralPath $installedFile -Raw | ConvertFrom-Json
        $candidates = @($installed.InstallationList | Where-Object {
            $_.AppName -match '^UE_(5\.\d+)$' -and [version]$Matches[1] -ge [version]'5.8'
        } | Sort-Object { [version]($_.AppName -replace '^UE_', '') } -Descending)
        foreach ($engine in $candidates) {
            $candidate = Join-Path $engine.InstallLocation 'Engine/Binaries/Win64/UnrealEditor.exe'
            if (Test-Path -LiteralPath $candidate) { $EditorPath = $candidate; break }
        }
    }
}
if (-not $EditorPath -or -not (Test-Path -LiteralPath $EditorPath -PathType Leaf)) {
    throw 'Unreal Editor was not found. Install a stable UE 5.8+ through Epic Games Launcher, then rerun. Or pass -EditorPath "E:/UE_5.8/Engine/Binaries/Win64/UnrealEditor.exe".'
}
if ($GenerateIsland -and -not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw 'Export the island first: run pnpm unreal:export from the repository root.'
}
if ($Build) {
    & (Join-Path $PSScriptRoot 'build-native.ps1') -EditorPath $EditorPath -ProjectPath $ProjectPath
    if ($LASTEXITCODE -ne 0) { throw 'Native compilation failed; the editor was not launched.' }
}
$arguments = @(('"' + $ProjectPath + '"'), '-log')
if ($GenerateIsland) { $arguments += ('-ExecutePythonScript="' + $scriptPath + '"') }
Start-Process -FilePath $EditorPath -WorkingDirectory (Split-Path -Parent $EditorPath) -ArgumentList $arguments -WindowStyle Hidden
