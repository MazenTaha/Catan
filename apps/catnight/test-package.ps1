# Tests the cooked Development executable, without an editor or golden fixtures.
# Screenshots still need visual review; this does not replace physical gamepad testing.
param(
  [string]$PackageDir = (Join-Path $PSScriptRoot 'Packaged/Windows'),
  [string]$Engine = 'E:/UE_5.8',
  [int]$TimeoutSeconds = 240,
  [switch]$ReviewTable
)
$ErrorActionPreference = 'Stop'
$exe = Join-Path $PackageDir 'Catnight/Binaries/Win64/Catnight.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "Packaged Development game not found: $exe" }
$exe = (Resolve-Path -LiteralPath $exe).Path
$out = Join-Path $PSScriptRoot ('Saved/PackageValidation/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $out -Force | Out-Null
$results = @()

# Inspect the actual cooked container, including assets that a particular seed may not display.
$pakTool = Join-Path $Engine 'Engine/Binaries/Win64/UnrealPak.exe'
$container = Join-Path $PackageDir 'Catnight/Content/Paks/Catnight-Windows.utoc'
$csv = Join-Path $out 'container.csv'
& $pakTool "-ListContainer=$container" "-Csv=$csv" "-abslog=$(Join-Path $out 'container.log')" | Out-Null
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $csv)) { throw 'Could not inspect the cooked artwork.' }
$cooked = @{}
Import-Csv -LiteralPath $csv | ForEach-Object { $cooked[$_.Filename] = $true }
if (@($cooked.Keys | Where-Object { $_ -match '/SM_Revolver\.uasset$' }).Count) {
  throw 'Cook still contains the retired revolver model. Reimport artwork and rebuild the package.'
}
if (@($cooked.Keys | Where-Object { $_ -match '/Generated/Island/Review/' }).Count) {
  throw 'Editor-only island composition map was included in the game.'
}
$content = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'Content')).Path
$sourceAssets = @(Get-ChildItem -LiteralPath (Join-Path $content 'Generated') -Recurse -Filter '*.uasset')
if (-not $sourceAssets.Count) { throw 'No imported artwork to compare; run pnpm catnight:import.' }
foreach ($asset in $sourceAssets) {
  $relative = $asset.FullName.Substring($content.Length + 1).Replace('\', '/')
  if (-not $cooked.ContainsKey("../../../Catnight/Content/$relative")) { throw "Cook omitted $relative" }
}
foreach ($shape in @('Cube', 'Cylinder', 'Sphere')) {
  if (-not $cooked.ContainsKey("../../../Engine/Content/BasicShapes/$shape.uasset")) { throw "Cook omitted basic shape $shape" }
}
$results += @{ scenario = 'cooked-artwork'; assets = $sourceAssets.Count; basicShapes = 3 }
Write-Host "Cook audit: $($sourceAssets.Count) generated assets and 3 basic shapes included."

function Run-Game([string]$Name, [string[]]$Options, [switch]$Screenshot, [int]$Width = 1280, [int]$Height = 720) {
  $log = Join-Path $out "$Name.log"
  $shot = Join-Path $out "$Name.png"
  $arguments = @('-unattended', '-nosplash', '-nosound', '-windowed', "-ResX=$Width", "-ResY=$Height",
    '-CatnightNoSave', '-CatnightFullMotion', "-abslog=`"$log`"") + $Options
  if ($Screenshot) { $arguments += "-CatnightShot=`"$shot`"" }
  Write-Host "Running packaged $Name..."
  $process = Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $PackageDir -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    $process.Kill()
    $process.WaitForExit()
    throw "Packaged $Name timed out. See $log"
  }
  if ($process.ExitCode -ne 0) { throw "Packaged $Name exited $($process.ExitCode). See $log" }
  if (-not (Test-Path -LiteralPath $log)) { throw "Packaged $Name did not create its log." }
  $text = [IO.File]::ReadAllText($log)
  if ($text -match 'Fatal error|Ensure condition failed|Log\w+: Error:|Catnight: missing model|generated materials missing|Failed to find object|Failed to compile Material|Default Material will be used') {
    throw "Packaged $Name logged an error or missing asset. See $log"
  }
  if ($Screenshot -and -not (Test-Path -LiteralPath $shot)) { throw "Packaged $Name did not create $shot" }
  return $text
}

# These tests use in-memory matches; Rules.Golden is an editor check with external fixtures.
$tests = Run-Game 'matches' @('-nullrhi', '-ExecCmds="Automation RunTests Catnight.Match"', '-TestExit="Automation Test Queue Empty"')
$completed = [regex]::Matches($tests, 'Test Completed\. Result=\{(\w+)\}')
if ($completed.Count -ne 3 -or @($completed | Where-Object { $_.Groups[1].Value -ne 'Success' }).Count) {
  throw "Expected three successful packaged match tests. See $out/matches.log"
}
$results += @{ scenario = 'matches'; passed = 3 }

$melee = Run-Game 'melee-only' @('-nullrhi', '-ExecCmds="Automation RunTests Catnight.Hero"', '-TestExit="Automation Test Queue Empty"')
if ($melee -notmatch 'Test Completed. Result=\{Success\} Name=\{MeleeOnlyRules\}' -or
    $melee -notmatch 'Test Completed. Result=\{Success\} Name=\{Assets\}') {
  throw "Packaged hero assets or melee-only rules did not pass. See $out/melee-only.log"
}
$results += @{ scenario = 'hero-assets-and-melee-only'; passed = 2 }

$island = Run-Game 'island-routes' @('-nullrhi', '-ExecCmds="Automation RunTests Catnight.Island"', '-TestExit="Automation Test Queue Empty"')
if ($island -notmatch 'Test Completed. Result=\{Success\} Name=\{RoutesAndMatch\}') {
  throw "Packaged island terrain/routes did not pass. See $out/island-routes.log"
}
$results += @{ scenario = 'island-terrain-routes-and-match'; passed = 1 }

$angles = @('0,0,1', '40,12,0.9', '-55,-18,1.1')
for ($i = 0; $i -lt $angles.Count; $i++) {
  $name = "setup-$i"
  $text = Run-Game $name @('-CatnightSeed=board3d-handoff', '-CatnightPickTest', "-CatnightCamera=$($angles[$i])", '-CatnightShotAfter=8') -Screenshot
  $pick = [regex]::Match($text, 'CATNIGHT PICK (\d+) of (\d+) targets picked back \((\d+) legal\)')
  if (-not $pick.Success -or [int]$pick.Groups[1].Value -le 0 -or
    $pick.Groups[1].Value -ne $pick.Groups[2].Value -or $pick.Groups[1].Value -ne $pick.Groups[3].Value) {
    throw "Packaged picking failed for $name. See $out/$name.log"
  }
  $results += @{ scenario = $name; picked = [int]$pick.Groups[1].Value; camera = $angles[$i] }
}

foreach ($screen in @('title', 'new')) {
  $null = Run-Game $screen @("-CatnightScreen=$screen", '-CatnightShotAfter=6') -Screenshot
  $results += @{ scenario = $screen; screenshot = "$screen.png" }
}
$null = Run-Game 'flat' @('-CatnightSeed=board3d-handoff', '-CatnightFlat', '-CatnightShotAfter=6') -Screenshot
$results += @{ scenario = 'flat'; screenshot = 'flat.png' }
$text = Run-Game 'autoplay' @('-CatnightSeed=match-0', '-CatnightPlayers=3', '-CatnightAutoplay', '-CatnightBotDelay=0', '-CatnightShotOnWin', '-CatnightShotAfter=6') -Screenshot
$win = [regex]::Match($text, 'CATNIGHT CAPTURE victory after (\d+) actions')
if (-not $win.Success -or [int]$win.Groups[1].Value -le 0) { throw "Rendered match did not reach victory. See $out/autoplay.log" }
$results += @{ scenario = 'autoplay'; actions = [int]$win.Groups[1].Value; screenshot = 'autoplay.png'; requiresVisualVictoryReview = $true }

if ($ReviewTable) {
  $scenes = @(
    @{ Name = 'build-foundation'; Mode = 'build'; After = '0.35'; Close = $true },
    @{ Name = 'build-walls'; Mode = 'build'; After = '2.5'; Close = $true },
    @{ Name = 'build-finished'; Mode = 'build'; After = '5.5'; Close = $true },
    @{ Name = 'city-building'; Mode = 'upgrade'; After = '2.5'; Close = $true },
    @{ Name = 'dice-rolling'; Mode = 'roll'; After = '0.35'; Close = $true },
    @{ Name = 'dice-settled'; Mode = 'roll'; After = '1.6'; Close = $true },
    @{ Name = 'production'; Mode = 'production'; After = '1.5' },
    @{ Name = 'reduced-build'; Mode = 'build'; After = '0.35'; Close = $true; Reduced = $true },
    @{ Name = 'map-note-deck'; Mode = 'production'; After = '1.5'; Inspect = $true }
  )
  foreach ($scene in $scenes) {
    $options = @('-CatnightSeed=board3d-handoff', '-CatnightPlayers=3', "-CatnightReview=$($scene.Mode)", "-CatnightShotAfter=$($scene.After)")
    if ($scene.Close) { $options += '-CatnightReviewCloseup' }
    if ($scene.Reduced) { $options += '-CatnightReduceMotion' }
    if ($scene.Inspect) { $options += '-CatnightInspect=0' }
    $text = Run-Game $scene.Name $options -Screenshot -Width 1280 -Height 800
    if ($text -notmatch "CATNIGHT REVIEW $($scene.Mode) at action") { throw "Review event was not reached: $($scene.Name)" }
    $results += @{ scenario = $scene.Name; screenshot = "$($scene.Name).png"; requiresVisualReview = $true }
  }
}

$report = @{ executable = $exe; results = $results; physicalGamepadChecked = $false }
[IO.File]::WriteAllText((Join-Path $out 'report.json'), ($report | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Write-Host "PASSED: packaged match tests, three picking views, and screen captures. Review screenshots in $out"
