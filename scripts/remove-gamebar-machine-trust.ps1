param(
    [Parameter(Mandatory = $true)][string]$ExpectedThumbprint,
    [Parameter(Mandatory = $true)][string]$ResultPath
)

$ErrorActionPreference = "Stop"

try {
    $normalizedExpected = $ExpectedThumbprint.Replace(" ", "").ToUpperInvariant()
    $store = [System.Security.Cryptography.X509Certificates.X509Store]::new(
        [System.Security.Cryptography.X509Certificates.StoreName]::TrustedPeople,
        [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
    )
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    try {
        $matches = $store.Certificates.Find(
            [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
            $normalizedExpected,
            $false
        )
        foreach ($certificate in $matches) {
            $store.Remove($certificate)
        }
    }
    finally {
        $store.Close()
    }

    Set-Content -LiteralPath $ResultPath -Value "PASS`nTHUMBPRINT=$normalizedExpected" -Encoding UTF8
    exit 0
}
catch {
    Set-Content -LiteralPath $ResultPath -Value "FAIL`n$($_.Exception.Message)" -Encoding UTF8
    exit 1
}
