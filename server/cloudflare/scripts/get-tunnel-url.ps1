$ErrorActionPreference = "Continue"
. "$PSScriptRoot\_common.ps1"

$url = Get-LatestTunnelUrlFromLogs
if ($url) {
    Show-TunnelPublicUrl -Url $url
} else {
    Write-Host "No tunnel URL found. Start the tunnel first: npm run tunnel:start" -ForegroundColor Red
    exit 1
}
