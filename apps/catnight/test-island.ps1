# Exercise the native live island, then retain rendered views of all six biomes.
param([switch]$Editor,[string]$Engine='E:/UE_5.8',[switch]$Quick)
$ErrorActionPreference='Stop'
$out=Join-Path $PSScriptRoot ('Saved/IslandValidation/'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Force -Path $out | Out-Null
$exe=if($Editor){"$Engine/Engine/Binaries/Win64/UnrealEditor-Cmd.exe"}else{"$PSScriptRoot/Packaged/Windows/Catnight/Binaries/Win64/Catnight.exe"}
$prefix=if($Editor){@("`"$PSScriptRoot/Catnight.uproject`"",'-game','-DisablePlugins=AllToolsets,ModelContextProtocol')}else{@()}
function Run-Island([string]$name,[string[]]$options){
  $log=Join-Path $out "$name.log"
  $args=$prefix+@('-windowed','-ResX=1280','-ResY=800','-unattended','-nosplash','-nosound','-CatnightNoSave','-CatnightSeed=island-rework',"-abslog=`"$log`"")+$options
  $p=Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden -PassThru
  if(-not $p.WaitForExit(240000)){$p.Kill();throw "Island $name timed out: $log"}
  if($p.ExitCode -ne 0){throw "Island $name exited $($p.ExitCode): $log"}
  $text=[IO.File]::ReadAllText($log)
  if($text -match 'Fatal error|Ensure condition failed|Log\w+: Error:|ISLAND missing|Default Material will be used|Failed to compile Material'){throw "Island $name failed log check: $log"}
  return $text
}
if(-not $Quick){
  $text=Run-Island 'return' @('-nullrhi','-CatnightIsland=return')
  if($text -notmatch 'ISLAND RETURN PASSED: 3 cycles'){throw 'Island/table lifecycle did not pass'}
  foreach($rate in @(10,60,144)){
    Write-Host "Checking walking/riding across all 19 tiles at $rate Hz fixed simulation..."
    $text=Run-Island "movement-$rate" @('-nullrhi','-CatnightIsland=movement','-UseFixedTimeStep',"-FPS=$rate",'-ExecCmds="t.MaxFPS 0"')
    if($text -notmatch 'ISLAND MOVEMENT PASSED: (\d+) checks, 0 failures, 95 scenarios'){throw "Island movement did not pass: $rate"}
  }
}
$views=if($Quick){@(@('pasture',0),@('forest',8))}else{@(@('pasture',0),@('fields',1),@('mountains',3),@('hills',4),@('forest',8),@('desert',9))}
foreach($view in $views){
  $name=$view[0];$hex=$view[1];$shot=Join-Path $out "$name.png"
  Write-Host "Capturing native island $name..."
  $null=Run-Island $name @("-CatnightIsland=$hex",'-CatnightHeroAngle=45',"-CatnightShot=`"$shot`"",'-CatnightShotAfter=6')
  if(-not(Test-Path -LiteralPath $shot)){throw "No island $name capture"}
}
Write-Host "ISLAND CHECKS PASSED. Visually review $out"
