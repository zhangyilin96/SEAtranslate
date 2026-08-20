param(
    [Parameter(Mandatory = $true)][string]$ExpectedThumbprint,
    [Parameter(Mandatory = $true)][string]$ResultPath,
    [ValidateSet("TrustedPeople", "RootAndTrustedPeople")][string]$StoreScope = "TrustedPeople"
)

$ErrorActionPreference = "Stop"

try {
    $normalizedExpected = $ExpectedThumbprint.Replace(" ", "").ToUpperInvariant()
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
    }

    Set-Content -LiteralPath $ResultPath -Value "PASS`nTHUMBPRINT=$normalizedExpected`nSCOPE=$StoreScope" -Encoding UTF8
    exit 0
}
catch {
    Set-Content -LiteralPath $ResultPath -Value "FAIL`n$($_.Exception.Message)" -Encoding UTF8
    exit 1
}
