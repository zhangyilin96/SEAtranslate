$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $projectRoot 'native\native-overlay-poc'
$packageRoot = Join-Path $sourceRoot 'packages'
$outputRoot = Join-Path $projectRoot 'outputs\Native Overlay PoC'
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path -LiteralPath $compiler)) {
  throw "C# compiler not found: $compiler"
}

$assemblyNames = @(
  'SharpDX.dll',
  'SharpDX.DXGI.dll',
  'SharpDX.Direct3D11.dll',
  'SharpDX.Direct2D1.dll',
  'SharpDX.DirectComposition.dll'
)

$assemblies = foreach ($name in $assemblyNames) {
  $match = Get-ChildItem -LiteralPath $packageRoot -Recurse -Filter $name |
    Where-Object { $_.FullName -like '*\lib\net45\*' } |
    Select-Object -First 1
  if (-not $match) { throw "Missing package assembly: $name" }
  $match.FullName
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$outputExe = Join-Path $outputRoot 'Dota Scout Native Overlay Test.exe'

$arguments = @(
  '/nologo',
  '/target:winexe',
  '/platform:x64',
  '/optimize+',
  '/debug-',
  "/out:$outputExe",
  "/win32manifest:$(Join-Path $sourceRoot 'app.manifest')",
  '/main:DotaScout.NativeOverlayPoc.Bootstrap'
)

foreach ($assembly in $assemblies) {
  $arguments += "/reference:$assembly"
  $arguments += "/resource:$assembly,$([System.IO.Path]::GetFileName($assembly))"
}

$arguments += (Join-Path $sourceRoot 'NativeOverlayPoc.cs')
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw "Native Overlay compilation failed with exit code $LASTEXITCODE" }

Write-Output "Native DirectComposition Overlay PoC: $outputExe"
