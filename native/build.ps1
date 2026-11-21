# Builds the Catnight rules library and its tests with MSVC, outside Unreal.
#   powershell -File native/build.ps1 [-Test] [-Debug] [-TestArgs '--only fuzz']
# The golden tests need `pnpm golden` once (it writes native/golden/data).
param(
  [switch]$Test,
  [switch]$Debug,
  [string]$TestArgs = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$rules = Join-Path $repo 'apps/catnight/Plugins/CatnightRules/Source/CatnightRules'
$out = Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Force $out | Out-Null

# Find MSVC and the Windows SDK (Build Tools on this PC live on E:, so vswhere may not see them).
function Find-Msvc {
  $roots = @($env:CATNIGHT_MSVC, 'E:\CppBuildTools', "${env:ProgramFiles}\Microsoft Visual Studio", "${env:ProgramFiles(x86)}\Microsoft Visual Studio") | Where-Object { $_ }
  foreach ($r in $roots) {
    $cl = Get-ChildItem $r -Recurse -Filter cl.exe -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'Hostx64\\x64\\cl\.exe$' } | Sort-Object FullName -Descending | Select-Object -First 1
    if ($cl) { return (Resolve-Path (Join-Path $cl.DirectoryName '..\..\..')).Path }
  }
  throw 'MSVC (cl.exe) not found; set CATNIGHT_MSVC to the Build Tools folder'
}
function Find-Sdk {
  foreach ($r in @($env:CATNIGHT_WINSDK, 'E:\Windows Kits\10', "${env:ProgramFiles(x86)}\Windows Kits\10") | Where-Object { $_ }) {
    $inc = Get-ChildItem (Join-Path $r 'Include') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($inc) { return @{ Root = $r; Version = $inc.Name } }
  }
  throw 'Windows SDK not found; set CATNIGHT_WINSDK'
}
$msvc = Find-Msvc
$sdk = Find-Sdk
$v = $sdk.Version
$env:PATH = "$msvc\bin\Hostx64\x64;$env:PATH"
$env:INCLUDE = "$msvc\include;$($sdk.Root)\Include\$v\ucrt;$($sdk.Root)\Include\$v\um;$($sdk.Root)\Include\$v\shared"
$env:LIB = "$msvc\lib\x64;$($sdk.Root)\Lib\$v\ucrt\x64;$($sdk.Root)\Lib\$v\um\x64"

# /fp:precise without contraction keeps doubles bit-identical to JavaScript (bots compare scores).
[string[]]$opt = if ($Debug) { '/Od', '/Zi' } else { '/O2' }
$sources = @(Get-ChildItem (Join-Path $rules 'Private') -Filter *.cpp | Where-Object { $_.Name -notlike '*Module.cpp' } | ForEach-Object FullName)
$sources += Join-Path $PSScriptRoot 'tests/main.cpp'
$exe = Join-Path $out 'catnight_tests.exe'
Push-Location $out
try {
  & cl.exe /nologo /std:c++20 /EHs-c- /D_HAS_EXCEPTIONS=0 /fp:precise /W4 /WX /permissive- /Zc:__cplusplus /utf-8 @opt `
    /I (Join-Path $rules 'Public') $sources /Fe:$exe /link /nologo
  if ($LASTEXITCODE -ne 0) { throw "build failed ($LASTEXITCODE)" }
} finally { Pop-Location }
Write-Host "built $exe"

if ($Test) {
  Push-Location $repo
  try {
    & $exe @($TestArgs -split ' ' | Where-Object { $_ })
    if ($LASTEXITCODE -ne 0) { throw 'tests failed' }
  } finally { Pop-Location }
}
