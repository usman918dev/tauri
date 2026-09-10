# Script to sign built Tauri binaries with PPTXPro Developer Certificate
$subject = "CN=PPTXPro Developer Certificate"
$cert = Get-ChildItem -Path Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $subject } | Select-Object -First 1

if (-not $cert) {
    Write-Host "Code signing certificate not found. Running create_cert.ps1..."
    & "$PSScriptRoot\create_cert.ps1"
    $cert = Get-ChildItem -Path Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $subject } | Select-Object -First 1
}

if (-not $cert) {
    Write-Error "Failed to obtain code signing certificate."
    exit 1
}

Write-Host "Using Certificate: $($cert.Subject) ($($cert.Thumbprint))"

$searchDirs = @(
    "src-tauri\target\release",
    "src-tauri\target\release\bundle"
)

$targetFiles = Get-ChildItem -Path $searchDirs -Include *.exe, *.msi -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "\\deps\\" -and $_.FullName -notmatch "\\build\\" }

if (-not $targetFiles -or $targetFiles.Count -eq 0) {
    Write-Host "No binaries found to sign yet. Build your desktop app first with 'npm run build:desktop'."
    exit 0
}

foreach ($file in $targetFiles) {
    Write-Host "Signing binary: $($file.FullName)..."
    try {
        $result = Set-AuthenticodeSignature -FilePath $file.FullName -Certificate $cert -ErrorAction Stop
        Write-Host "  -> Status: $($result.Status)"
    } catch {
        Write-Host "  -> Failed to sign $($file.Name): $_"
    }
}

Write-Host "SUCCESS: Code signing complete!"
