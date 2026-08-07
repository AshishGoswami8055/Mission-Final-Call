$ErrorActionPreference = "Continue"
. "$PSScriptRoot\_common.ps1"

Write-Host "=== Tunnel Status ===" -ForegroundColor Cyan

$local = Test-LocalApi
if ($local.ok) {
    Write-Host "[OK] Local API: http://127.0.0.1:5001/api/health" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Local API not running" -ForegroundColor Red
}

$publicUrl = Read-DotEnvValue "PUBLIC_API_URL"
if (-not $publicUrl) { $publicUrl = Read-DotEnvValue "CLOUDFLARE_TUNNEL_URL" }
if ($publicUrl) {
    try {
        $health = $publicUrl.TrimEnd("/") + "/api/health"
        $r = Invoke-WebRequest -Uri $health -UseBasicParsing -TimeoutSec 15
        Write-Host "[OK] Public: $health -> $($r.Content)" -ForegroundColor Green
    } catch {
        Write-Host "[FAIL] Public URL not reachable (tunnel may be stopped or URL changed)" -ForegroundColor Red
        Write-Host "       Run: npm run tunnel:start and update PUBLIC_API_URL in server/.env"
    }
}

try {
    $cf = Get-CloudflaredPath
    & $cf --version
} catch {
    Write-Host "[FAIL] cloudflared not installed" -ForegroundColor Red
}
