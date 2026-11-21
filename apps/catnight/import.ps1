# Rebuilds /Game/Generated (models and materials) from the web game's Blender GLBs.
#   pnpm catnight:import
# 1. Blender joins each model into one mesh (Tools/split_models.py -> SourceArt/Models).
# 2. Unreal imports them and makes the board materials (Tools/import_models.py).
# Close the Unreal editor first. Both outputs are git-ignored; this script recreates them.
param(
  [string]$Engine = 'E:/UE_5.8',
  [string]$Blender = 'E:/Blender/blender.exe'
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$repo = Resolve-Path "$here/../.."
$models = "$repo/apps/web/public/models"
$out = "$here/SourceArt/Models"

& $Blender -b -P "$here/Tools/split_models.py" -- $models $out
if ($LASTEXITCODE -ne 0) { throw "Blender failed ($LASTEXITCODE)" }

$log = "$here/Saved/Logs/catnight-import.log"
& "$Engine/Engine/Binaries/Win64/UnrealEditor-Cmd.exe" "$here/Catnight.uproject" -run=pythonscript -script="$here/Tools/import_models.py" -unattended -nosplash -nop4 -abslog="$log"
$code = $LASTEXITCODE
Select-String -Path $log -Pattern 'Catnight import|Error' | Select-Object -Last 20 | ForEach-Object { $_.Line }
if ($code -ne 0) { throw "Unreal import failed ($code), see $log" }

# Native characters use a separate skeletal FBX pipeline; the board import never joins their rigs.
& "$PSScriptRoot/import-heroes.ps1" -Engine $Engine -Blender $Blender
