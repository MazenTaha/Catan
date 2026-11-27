# Recreate the original Blender island kit without replacing the board or character assets.
param([string]$Engine='E:/UE_5.8',[string]$Blender='E:/Blender/blender.exe')
$ErrorActionPreference='Stop'
$repo=(Resolve-Path "$PSScriptRoot/../..").Path
& $Blender -b -P "$repo/assets/blender/native_island.py"
if($LASTEXITCODE -ne 0){throw 'Island Blender export failed'}
$log="$PSScriptRoot/Saved/Logs/island-import.log"
& "$Engine/Engine/Binaries/Win64/UnrealEditor-Cmd.exe" "$PSScriptRoot/Catnight.uproject" -run=pythonscript "-script=$PSScriptRoot/Tools/import_island.py" '-DisablePlugins=AllToolsets,ModelContextProtocol' -unattended -nosplash -nosound -nullrhi "-abslog=$log" | Out-Null
if($LASTEXITCODE -ne 0){throw "Island import failed: $log"}
Write-Host 'Imported native island furnishings and ground material.'
