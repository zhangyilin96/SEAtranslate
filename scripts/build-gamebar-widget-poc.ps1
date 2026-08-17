param(
    [string]$SigningThumbprint = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $projectRoot "native\gamebar-widget-poc"
$projectFile = Join-Path $sourceRoot "DotaScout.GameBarWidget.csproj"
$buildRoot = Join-Path $projectRoot "work\gamebar-widget-msbuild"
$assetRoot = Join-Path $buildRoot "Assets"
$packageRoot = Join-Path $buildRoot "AppPackages"
$nugetRoot = Join-Path $projectRoot "work\gamebar-msbuild-packages"
$outputRoot = Join-Path $projectRoot "outputs\Game Bar Widget PoC"
$dependencyRoot = Join-Path $outputRoot "Dependencies\x64"
$outputMsix = Join-Path $outputRoot "Dota Scout Game Bar Widget Test.msix"
$msbuild = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe"
$signTool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"

function New-BadgeAsset {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][int]$Size
    )

    Add-Type -AssemblyName System.Drawing
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::FromArgb(12, 18, 29))

    $fontSize = [Math]::Max(9, [Math]::Floor($Size * 0.32))
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(69, 213, 255))
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString("DS", $font, $brush, (New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)), $format)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

    $format.Dispose()
    $brush.Dispose()
    $font.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

if (-not (Test-Path -LiteralPath $msbuild)) {
    throw "Visual Studio Build Tools with the UWP workload was not found: $msbuild"
}

if (-not (Test-Path -LiteralPath $projectFile)) {
    throw "Game Bar Widget project was not found: $projectFile"
}

$resolvedProjectRoot = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\')
$resolvedBuildRoot = [System.IO.Path]::GetFullPath($buildRoot)
if (-not $resolvedBuildRoot.StartsWith($resolvedProjectRoot + "\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean build directory outside the project: $resolvedBuildRoot"
}

if (Test-Path -LiteralPath $buildRoot) {
    Remove-Item -LiteralPath $buildRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $assetRoot -Force | Out-Null
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
New-Item -ItemType Directory -Path $dependencyRoot -Force | Out-Null

New-BadgeAsset -Path (Join-Path $assetRoot "StoreLogo.png") -Size 50
New-BadgeAsset -Path (Join-Path $assetRoot "Square44x44Logo.png") -Size 44
New-BadgeAsset -Path (Join-Path $assetRoot "Square150x150Logo.png") -Size 150

$msbuildArguments = @(
    $projectFile,
    "/restore",
    "/t:Rebuild",
    "/m",
    "/p:Configuration=Debug",
    "/p:Platform=x64",
    "/p:GameBarAssetRoot=$assetRoot",
    "/p:RestorePackagesPath=$nugetRoot",
    "/p:GenerateAppxPackageOnBuild=true",
    "/p:AppxPackageDir=$packageRoot\",
    "/p:AppxBundle=Never",
    "/p:UapAppxPackageBuildMode=SideloadOnly",
    "/p:AppxPackageSigningEnabled=$([bool]$SigningThumbprint)"
)

if ($SigningThumbprint) {
    $msbuildArguments += "/p:PackageCertificateThumbprint=$($SigningThumbprint.Replace(' ', ''))"
}

& $msbuild @msbuildArguments
if ($LASTEXITCODE -ne 0) {
    throw "Game Bar Widget MSBuild failed with exit code $LASTEXITCODE"
}

$builtPackage = Get-ChildItem -LiteralPath $packageRoot -File -Recurse |
    Where-Object {
        $_.Extension -in ".appx", ".msix" -and
        $_.FullName -notmatch "[\\/]Dependencies[\\/]" -and
        $_.BaseName -like "DotaScout.GameBarWidget_*"
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $builtPackage) {
    throw "MSBuild completed but did not produce an APPX package under $packageRoot"
}

Copy-Item -LiteralPath $builtPackage.FullName -Destination $outputMsix -Force

$builtDependencies = Get-ChildItem -LiteralPath $packageRoot -Filter "*.appx" -File -Recurse |
    Where-Object { $_.FullName -match "[\\/]Dependencies[\\/]x64[\\/]" }
foreach ($dependency in $builtDependencies) {
    Copy-Item -LiteralPath $dependency.FullName -Destination $dependencyRoot -Force
}

if ($SigningThumbprint) {
    if (-not (Test-Path -LiteralPath $signTool)) {
        throw "Windows SDK signtool was not found: $signTool"
    }

    & $signTool verify /pa $outputMsix
    if ($LASTEXITCODE -ne 0) {
        throw "The generated package did not pass signature verification."
    }
}

Write-Output "Game Bar Widget MSIX: $outputMsix"
Write-Output "Built with standard UWP XAML/MSBuild: True"
Write-Output "Signed: $([bool]$SigningThumbprint)"
Write-Output "No certificate trust settings were changed by this build."
