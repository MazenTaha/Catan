param([string]$EditorPath=$env:UNREAL_EDITOR,[switch]$GenerateIsland,[switch]$Build)
& (Join-Path (Split-Path -Parent $PSScriptRoot) 'unreal/open-island.ps1') -EditorPath $EditorPath -ProjectPath (Join-Path $PSScriptRoot 'CatanNight.uproject') -GenerateIsland:$GenerateIsland -Build:$Build
