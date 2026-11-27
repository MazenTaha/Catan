# Rebuilds the native Windows app. Generated artwork is required, never silently omitted.
param(
  [string]$Engine = 'E:/UE_5.8',
  [ValidateSet('Development', 'Shipping')][string]$Configuration = 'Development',
  [string]$OutputDir = (Join-Path $PSScriptRoot 'Packaged')
)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'Content/Generated/Models/props/SM_Revolver.uasset')) {
  throw 'Retired revolver artwork is still imported. Run pnpm catnight:import before packaging.'
}
$project = Join-Path $PSScriptRoot 'Catnight.uproject'
$uat = Join-Path $Engine 'Engine/Build/BatchFiles/RunUAT.bat'
if (-not (Test-Path -LiteralPath $uat)) { throw "Unreal packaging tool not found: $uat" }

$manifestPath = Join-Path $PSScriptRoot 'Saved/catnight-import.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw 'Board artwork is missing. Build the editor target, then run pnpm catnight:import first.'
}
$manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
$required = @('M_Tint', 'M_Glow', 'M_VertexColor', 'M_Water', 'M_Model', 'M_ModelMasked', 'M_Construction') |
  ForEach-Object { Join-Path $PSScriptRoot "Content/Generated/Materials/$_.uasset" }
$modelCount = 0
foreach ($family in @('village', 'flora', 'rocks', 'props', 'supplies')) {
  $models = $manifest.$family
  if (-not $models -or @($models.PSObject.Properties).Count -eq 0) {
    throw "Import manifest has no $family models. Rerun pnpm catnight:import."
  }
  foreach ($model in $models.PSObject.Properties) {
    $required += Join-Path $PSScriptRoot ('Content/' + $model.Value.Substring(6) + '.uasset')
    $modelCount++
  }
}
$missing = @($required | Where-Object { -not (Test-Path -LiteralPath $_) })
if ($missing.Count) { throw "Imported artwork is incomplete. Rerun pnpm catnight:import. Missing: $($missing -join ', ')" }
$heroManifest=Join-Path $PSScriptRoot 'SourceArt/Heroes/manifest.json'
if(-not(Test-Path -LiteralPath $heroManifest)){throw 'Native heroes are missing. Run pnpm catnight:heroes.'}
$heroes=[IO.File]::ReadAllText($heroManifest) | ConvertFrom-Json
foreach($family in $heroes.models.PSObject.Properties){
  $heroFiles=@("SK_$($family.Name)")
  foreach($mode in $family.Value.clips.PSObject.Properties){$heroFiles+="A_$($family.Name)_$($mode.Name)"}
  foreach($name in $heroFiles){
    if(-not(Test-Path -LiteralPath (Join-Path $PSScriptRoot "Content/Generated/Heroes/$name.uasset"))){throw "Native hero asset missing: $name. Run pnpm catnight:heroes."}
  }
}
Write-Host "Artwork preflight: $modelCount meshes and 7 base materials present."

& $uat BuildCookRun "-project=$project" -noP4 -platform=Win64 "-clientconfig=$Configuration" `
  -build -cook -stage -pak -archive "-archivedirectory=$OutputDir" -unattended -utf8output -nocompileeditor
if ($LASTEXITCODE -ne 0) { throw "Packaging failed ($LASTEXITCODE)." }
$exe = Join-Path $OutputDir 'Windows/Catnight.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "Packaging did not produce $exe" }
Write-Host "Packaged: $exe"
