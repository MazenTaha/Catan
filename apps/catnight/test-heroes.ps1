# Native character assets, real movement/camera route, then rendered pose review.
param([switch]$Editor,[string]$Engine='E:/UE_5.8',[switch]$Quick)
$ErrorActionPreference='Stop'
$out=Join-Path $PSScriptRoot ('Saved/HeroValidation/'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Force -Path $out | Out-Null
$exe=if($Editor){"$Engine/Engine/Binaries/Win64/UnrealEditor-Cmd.exe"}else{"$PSScriptRoot/Packaged/Windows/Catnight/Binaries/Win64/Catnight.exe"}
$prefix=if($Editor){@("`"$PSScriptRoot/Catnight.uproject`"",'-game')}else{@()}
function Run-Hero([string]$name,[string[]]$options){
  $log=Join-Path $out "$name.log"
  $args=$prefix+@('-windowed','-ResX=1280','-ResY=800','-unattended','-nosplash','-nosound','-CatnightNoSave',"-abslog=`"$log`"")+ $options
  $p=Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden -PassThru
  if(-not $p.WaitForExit(180000)){$p.Kill();throw "Hero $name timed out: $log"}
  if($p.ExitCode -ne 0){throw "Hero $name exited $($p.ExitCode): $log"}
  $text=[IO.File]::ReadAllText($log)
  if($text -match 'Fatal error|Ensure condition failed|Log\w+: Error:|HERO missing|HERO meshes missing|Default Material will be used|Failed to compile Material'){throw "Hero $name failed log check: $log"}
  return $text
}
if(-not $Quick){
  $text=Run-Hero 'assets' @('-nullrhi','-ExecCmds="Automation RunTests Catnight.Hero"','-TestExit="Automation Test Queue Empty"')
  if($text -notmatch 'Test Completed. Result=\{Success\} Name=\{Assets\}'){throw 'Hero asset automation did not pass'}
  foreach($rate in @(10,60,144)){
    Write-Host "Checking actual movement at $rate Hz fixed simulation..."
    $text=Run-Hero "movement-$rate" @('-nullrhi','-CatnightHero=test','-UseFixedTimeStep',"-FPS=$rate",'-ExecCmds="t.MaxFPS 0"')
    if($text -notmatch 'HERO VALIDATION PASSED: (\d+) checks, 0 failures, 13 physical scenarios'){throw "Movement check did not pass: $rate"}
  }
  $text=Run-Hero 'return' @('-nullrhi','-CatnightHero=return')
  if($text -notmatch 'CATNIGHT HERO RETURN PASSED:'){throw 'Yard/table lifecycle check did not pass'}
}
foreach($mode in $(if($Quick){@('idle','ride')}else{@('idle','walk','run','crouch','ride','gallop')})){
  Write-Host "Capturing native $mode..."
  $shot=Join-Path $out "$mode.png"
  $null=Run-Hero $mode @("-CatnightHero=$mode",'-CatnightHeroAngle=140','-ExecCmds="r.MotionBlurQuality 0"',"-CatnightShot=`"$shot`"",$(if($mode -eq "idle"){"-CatnightShotAfter=8"}else{"-CatnightShotAfter=4"}))
  if(-not(Test-Path -LiteralPath $shot)){throw "No $mode capture"}
}
if(-not $Quick){
  $shot=Join-Path $out 'riding-rear.png'
  $null=Run-Hero 'riding-rear' @('-CatnightHero=ride','-CatnightHeroAngle=0','-ExecCmds="r.MotionBlurQuality 0"',"-CatnightShot=`"$shot`"",'-CatnightShotAfter=4')
  if(-not(Test-Path -LiteralPath $shot)){throw 'No rear riding capture'}
}
Write-Host "HERO CHECKS PASSED. Visually review $out"
