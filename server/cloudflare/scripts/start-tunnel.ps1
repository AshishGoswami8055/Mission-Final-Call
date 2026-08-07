param(
    [ValidateSet("quick", "named")]
    [string]$Mode = "quick"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"

$cloudflared = Get-CloudflaredPath
Write-LogLine "Starting Cloudflare Tunnel (mode=$Mode)"

$local = Test-LocalApi
if ($local.ok) {
    Write-LogLine "Local API OK: $($local.body)"
} else {
    Write-LogLine "WARNING: Start backend first: cd server && npm run dev"
    Write-LogLine "Error: $($local.body)"
}

$CfRoot = Split-Path -Parent $PSScriptRoot
$config = Join-Path $CfRoot "config.yml"

if ($Mode -eq "named") {
    if (-not (Test-Path $config)) {
        throw "Missing config.yml - copy config.yml.example"
    }
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $cloudflared tunnel --config $config run --loglevel info 2>&1 | ForEach-Object {
        Write-LogLine $_
        Write-Host $_
    }
    $ErrorActionPreference = $prevEap
} else {
    Write-LogLine "QUICK tunnel -> http://127.0.0.1:5001"
    $script:TunnelUrlShown = $false
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $cloudflared tunnel --url http://127.0.0.1:5001 --loglevel info 2>&1 | ForEach-Object {
        Write-LogLine $_
        if ($_ -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
            $publicUrl = $Matches[1]
            Write-LogLine "PUBLIC URL: $publicUrl"
            if (-not $script:TunnelUrlShown) {
                $script:TunnelUrlShown = $true
                Show-TunnelPublicUrl -Url $publicUrl
            }
        } else {
            Write-Host $_
        }
    }
    $ErrorActionPreference = $prevEap
}
