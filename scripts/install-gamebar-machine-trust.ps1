param(
    [Parameter(Mandatory = $true)][string]$CertificatePath,
    [Parameter(Mandatory = $true)][string]$ExpectedThumbprint,
    [Parameter(Mandatory = $true)][string]$ResultPath,
    [ValidateSet("TrustedPeople", "RootAndTrustedPeople")][string]$StoreScope = "TrustedPeople"
)

$ErrorActionPreference = "Stop"

try {
    $resolvedCertificatePath = (Resolve-Path -LiteralPath $CertificatePath).Path
    $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($resolvedCertificatePath)
    $normalizedExpected = $ExpectedThumbprint.Replace(" ", "").ToUpperInvariant()

    if ($certificate.Thumbprint.ToUpperInvariant() -ne $normalizedExpected) {
        throw "Certificate thumbprint does not match the approved certificate."
    }

    if ($certificate.Subject -ne "CN=Dota Scout Development") {
        throw "Certificate subject is not the approved Dota Scout test signer."
    }

    $storeNames = if ($StoreScope -eq "RootAndTrustedPeople") {
        @(
            [System.Security.Cryptography.X509Certificates.StoreName]::Root,
            [System.Security.Cryptography.X509Certificates.StoreName]::TrustedPeople
        )
    }
    else {
        @([System.Security.Cryptography.X509Certificates.StoreName]::TrustedPeople)
    }

    foreach ($storeName in $storeNames) {
        $store = [System.Security.Cryptography.X509Certificates.X509Store]::new(
            $storeName,
            [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
        )
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
        try {
            $store.Add($certificate)
        }
        finally {
            $store.Close()
        }
    }

    Set-Content -LiteralPath $ResultPath -Value "PASS`nTHUMBPRINT=$normalizedExpected`nSCOPE=$StoreScope" -Encoding UTF8
    exit 0
}
catch {
    Set-Content -LiteralPath $ResultPath -Value "FAIL`n$($_.Exception.Message)" -Encoding UTF8
    exit 1
}
