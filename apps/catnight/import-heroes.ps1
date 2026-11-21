param([string]$Engine='E:/UE_5.8',[string]$Blender='E:/Blender/blender.exe')
$ErrorActionPreference='Stop'
& $Blender -b --python-exit-code 1 -P "$PSScriptRoot/Tools/build_heroes.py"
if($LASTEXITCODE -ne 0){throw 'Hero Blender build failed'}
if(-not(Test-Path "$PSScriptRoot/SourceArt/Heroes/manifest.json")){throw 'Hero manifest missing'}
& "$Engine/Engine/Binaries/Win64/UnrealEditor-Cmd.exe" "$PSScriptRoot/Catnight.uproject" -run=pythonscript "-script=$PSScriptRoot/Tools/import_heroes.py" -unattended -nosplash -nosound -nop4 "-abslog=$PSScriptRoot/Saved/Logs/hero-import.log"
if($LASTEXITCODE -ne 0){throw 'Hero Unreal import failed'}
