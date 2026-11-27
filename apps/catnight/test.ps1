# Builds the Catnight editor target and runs the Unreal automation tests:
#   Catnight.Rules.Golden   - every golden game replayed with Unreal's compiler settings
#   Catnight.Match.FullGames - 12 full games through the table's match code
#   powershell -File apps/catnight/test.ps1 [-Engine E:/UE_5.8] [-Filter Catnight] [-NoBuild]
# Needs `pnpm golden` once (native/golden/data). Close any running Catnight game first.
param(
  [string]$Engine = 'E:/UE_5.8',
  [string]$Filter = 'Catnight',
  [switch]$NoBuild
)
$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'Catnight.uproject'
if (-not $NoBuild) {
  & (Join-Path $Engine 'Engine/Build/BatchFiles/Build.bat') CatnightEditor Win64 Development "-Project=$project" -WaitMutex
  if ($LASTEXITCODE -ne 0) { throw "build failed ($LASTEXITCODE)" }
}
$log = Join-Path $PSScriptRoot 'Saved/Logs/automation.log'
# Game tests do not need experimental editor toolsets or a second listener on the user's MCP port.
& (Join-Path $Engine 'Engine/Binaries/Win64/UnrealEditor-Cmd.exe') $project "-ExecCmds=Automation RunTests $Filter" '-TestExit=Automation Test Queue Empty' '-DisablePlugins=AllToolsets,ModelContextProtocol' -unattended -nopause -nullrhi -nosplash -nosound "-abslog=$log" | Out-Null
$lines = Select-String -Path $log -Pattern 'Test Completed|CATNIGHT |LogAutomationController: Error' | ForEach-Object { $_.Line -replace '^\[[^\]]*\]\[[^\]]*\]', '' }
$lines | ForEach-Object { Write-Host $_ }
$done = @($lines | Where-Object { $_ -match 'Test Completed' })
$failed = @($done | Where-Object { $_ -notmatch 'Result=\{Success\}' })
if ($done.Count -eq 0 -or $failed.Count -gt 0) { throw "automation tests failed ($($failed.Count) of $($done.Count))" }
Write-Host "PASSED: $($done.Count) automation tests"
