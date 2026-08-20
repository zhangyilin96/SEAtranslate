param(
    [Parameter(Mandatory = $true)][string]$CertificatePath,
    [Parameter(Mandatory = $true)][string]$ExpectedThumbprint,
    [Parameter(Mandatory = $true)][string]$PackagePath,
    [Parameter(Mandatory = $true)][string]$ExpectedPackageFamilyName,
    [Parameter(Mandatory = $true)][string]$ResultPath
)

$ErrorActionPreference = "Stop"
$normalizedExpected = $ExpectedThumbprint.Replace(" ", "").ToUpperInvariant()
$stores = @(
    [System.Security.Cryptography.X509Certificates.StoreName]::Root,
    [System.Security.Cryptography.X509Certificates.StoreName]::TrustedPeople
)

try {
    $resolvedCertificatePath = (Resolve-Path -LiteralPath $CertificatePath).Path
    $resolvedPackagePath = (Resolve-Path -LiteralPath $PackagePath).Path
    $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($resolvedCertificatePath)
    $actualThumbprint = $certificate.Thumbprint.Replace(" ", "").ToUpperInvariant()
    if ($actualThumbprint -ne $normalizedExpected) {
        throw "Certificate thumbprint does not match the approved temporary signer."
    }
    if ($certificate.Subject -ne "CN=Dota Scout Development") {
        throw "Certificate subject is not the approved Dota Scout test signer."
    }

    foreach ($storeName in $stores) {
        $store = [System.Security.Cryptography.X509Certificates.X509Store]::new(
            $storeName,
            [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
        )
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
        try { $store.Add($certificate) }
        finally { $store.Close() }
    }

    Add-AppxPackage -Path $resolvedPackagePath -ForceApplicationShutdown
    $installed = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq $ExpectedPackageFamilyName }
    if (-not $installed) {
        throw "The expected Game Bar Widget package was not installed."
    }

    Set-Content -LiteralPath $ResultPath -Value "PASS`nPACKAGE=$($installed.PackageFullName)`nTHUMBPRINT=$normalizedExpected" -Encoding UTF8
    exit 0
}
catch {
    Set-Content -LiteralPath $ResultPath -Value "FAIL`nERROR=$($_.Exception.Message)" -Encoding UTF8
    exit 1
}
finally {
    foreach ($storeName in $stores) {
        $store = [System.Security.Cryptography.X509Certificates.X509Store]::new(
            $storeName,
            [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
        )
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
        try {
            $matches = $store.Certificates.Find(
                [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
                $normalizedExpected,
                $false
            )
            foreach ($match in $matches) { $store.Remove($match) }
        }
        finally { $store.Close() }
    }
}
