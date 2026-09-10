# Script to create and trust a local PPTXPro Developer Code Signing Certificate
$subject = "CN=PPTXPro Developer Certificate"

# Check if certificate already exists in Cert:\CurrentUser\My
$existingCert = Get-ChildItem -Path Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $subject } | Select-Object -First 1

if (-not $existingCert) {
    Write-Host "Creating new Code Signing Certificate..."
    $existingCert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $subject -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(5)
    Write-Host "Certificate Created: $($existingCert.Thumbprint)"
} else {
    Write-Host "Found existing Certificate: $($existingCert.Thumbprint)"
}

# Trust the certificate in CurrentUser Root store
try {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $store.Add($existingCert)
    $store.Close()
    Write-Host "Successfully added certificate to Trusted Root store."
} catch {
    Write-Host "Note on Root store trust: $_"
}

Write-Host "Certificate Thumbprint: $($existingCert.Thumbprint)"
