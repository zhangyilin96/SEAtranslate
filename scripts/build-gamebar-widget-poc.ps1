param(
    [string]$SigningThumbprint = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $projectRoot "native\gamebar-widget-poc"
$cacheRoot = Join-Path $projectRoot "work\gamebar-packages"
$buildRoot = Join-Path $projectRoot "work\gamebar-widget-build"
$layoutRoot = Join-Path $buildRoot "layout"
$outputRoot = Join-Path $projectRoot "outputs\Game Bar Widget PoC"
$dependencyRoot = Join-Path $outputRoot "Dependencies\x64"
$compiler = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

function Get-NuGetPackage {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Version
    )

    $folderName = "$Id.$Version"
    $archivePath = Join-Path $cacheRoot "$folderName.nupkg"
    $expandedPath = Join-Path $cacheRoot $folderName

    if (-not (Test-Path -LiteralPath $expandedPath)) {
        New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
        if (-not (Test-Path -LiteralPath $archivePath)) {
            $normalizedId = $Id.ToLowerInvariant()
            $uri = "https://api.nuget.org/v3-flatcontainer/$normalizedId/$Version/$normalizedId.$Version.nupkg"
            Invoke-WebRequest -Uri $uri -OutFile $archivePath
        }

        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $expandedPath)
    }

    return $expandedPath
}

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

if (-not (Test-Path -LiteralPath $compiler)) {
    throw "Inbox C# compiler not found: $compiler"
}

$gameBar = Get-NuGetPackage -Id "Microsoft.Gaming.XboxGameBar" -Version "7.2.240903001"
$uwpRefs = Get-NuGetPackage -Id "Microsoft.NETCore.UniversalWindowsPlatform" -Version "6.2.9"
$contracts = Get-NuGetPackage -Id "Microsoft.Windows.SDK.Contracts" -Version "10.0.26100.1"
$buildTools = Get-NuGetPackage -Id "Microsoft.Windows.SDK.BuildTools" -Version "10.0.26100.1"
$coreRuntime = Get-NuGetPackage -Id "runtime.win10-x64.Microsoft.Net.UWPCoreRuntimeSdk" -Version "2.2.9"

$resolvedProjectRoot = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\')
$resolvedBuildRoot = [System.IO.Path]::GetFullPath($buildRoot)
if (-not $resolvedBuildRoot.StartsWith($resolvedProjectRoot + "\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean build directory outside the project: $resolvedBuildRoot"
}

if (Test-Path -LiteralPath $buildRoot) {
    Remove-Item -LiteralPath $buildRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $layoutRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $layoutRoot "Assets") -Force | Out-Null
New-Item -ItemType Directory -Path $dependencyRoot -Force | Out-Null

$refRoot = Join-Path $uwpRefs "ref\uap10.0.15138"
$contractRoot = Join-Path $contracts "ref\netstandard2.0"
$gameBarWinmd = Join-Path $gameBar "lib\uap10.0\Microsoft.Gaming.XboxGameBar.winmd"
$outputExe = Join-Path $layoutRoot "DotaScoutGameBarWidget.exe"

$compilerArguments = @(
    "/nologo",
    "/noconfig",
    "/nostdlib+",
    "/target:appcontainerexe",
    "/platform:x64",
    "/subsystemversion:6.02",
    "/out:$outputExe",
    "/reference:$(Join-Path $refRoot 'mscorlib.dll')",
    "/reference:$(Join-Path $refRoot 'System.Runtime.dll')",
    "/reference:$(Join-Path $refRoot 'System.ObjectModel.dll')",
    "/reference:$(Join-Path $refRoot 'System.Collections.dll')",
    "/reference:$(Join-Path $refRoot 'System.Runtime.WindowsRuntime.dll')",
    "/reference:$(Join-Path $refRoot 'System.Runtime.WindowsRuntime.UI.Xaml.dll')",
    "/reference:$(Join-Path $contractRoot 'Windows.WinMD')",
    "/reference:$(Join-Path $contractRoot 'Windows.Foundation.FoundationContract.winmd')",
    "/reference:$(Join-Path $contractRoot 'Windows.Foundation.UniversalApiContract.winmd')",
    "/reference:$gameBarWinmd",
    (Join-Path $sourceRoot "Program.cs")
)

& $compiler @compilerArguments
if ($LASTEXITCODE -ne 0) {
    throw "Game Bar Widget compilation failed with exit code $LASTEXITCODE"
}

Copy-Item (Join-Path $sourceRoot "AppxManifest.xml") $layoutRoot -Force
Copy-Item $gameBarWinmd $layoutRoot -Force
Copy-Item (Join-Path $gameBar "private\Microsoft.Gaming.XboxGameBar.Private.winmd") $layoutRoot -Force
Copy-Item (Join-Path $gameBar "runtimes\win10-x64\native\Microsoft.Gaming.XboxGameBar.dll") $layoutRoot -Force
Copy-Item (Join-Path $gameBar "runtimes\win10-x64\native\Microsoft.Gaming.XboxGameBar.pri") $layoutRoot -Force

$assetRoot = Join-Path $layoutRoot "Assets"
New-BadgeAsset -Path (Join-Path $assetRoot "StoreLogo.png") -Size 50
New-BadgeAsset -Path (Join-Path $assetRoot "Square44x44Logo.png") -Size 44
New-BadgeAsset -Path (Join-Path $assetRoot "Square150x150Logo.png") -Size 150

$makeAppx = Join-Path $buildTools "bin\10.0.26100.0\x64\makeappx.exe"
$signTool = Join-Path $buildTools "bin\10.0.26100.0\x64\signtool.exe"
$outputMsix = Join-Path $outputRoot "Dota Scout Game Bar Widget Test.msix"

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
& $makeAppx pack /d $layoutRoot /p $outputMsix /o
if ($LASTEXITCODE -ne 0) {
    throw "MSIX packaging failed with exit code $LASTEXITCODE"
}

if ($SigningThumbprint) {
    & $signTool sign /fd SHA256 /sha1 $SigningThumbprint /s My $outputMsix
    if ($LASTEXITCODE -ne 0) {
        throw "MSIX signing failed with exit code $LASTEXITCODE"
    }
}

Copy-Item (Join-Path $coreRuntime "tools\Appx\Microsoft.NET.CoreRuntime.2.2.appx") $dependencyRoot -Force
Copy-Item (Join-Path $coreRuntime "tools\Appx\Microsoft.NET.CoreFramework.Debug.2.2.appx") $dependencyRoot -Force

Write-Output "Game Bar Widget MSIX: $outputMsix"
Write-Output "Signed: $([bool]$SigningThumbprint)"
Write-Output "No Developer Mode or certificate trust settings were changed by this build."
