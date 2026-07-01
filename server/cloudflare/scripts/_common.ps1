$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CfRoot = Split-Path -Parent $ScriptDir
$ServerRoot = Split-Path -Parent $CfRoot
$LogsDir = Join-Path $CfRoot "logs"

function Ensure-LogsDir {
    if (-not (Test-Path $LogsDir)) {
        New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
    }
}

function Get-CloudflaredPath {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        "${env:ProgramFiles}\cloudflared\cloudflared.exe",
        "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }
    throw "cloudflared not found. Run: server\cloudflare\scripts\install-cloudflared.ps1"
}

function Get-TunnelLogPath {
    Ensure-LogsDir
    return Join-Path $LogsDir ("tunnel-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
}

function Write-LogLine {
    param([string]$Message)
    $line = "[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] " + $Message
    Write-Host $line
    Add-Content -Path (Get-TunnelLogPath) -Value $line -Encoding UTF8
}

function Test-LocalApi {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/health" -UseBasicParsing -TimeoutSec 5
        return @{ ok = ($r.StatusCode -eq 200); body = $r.Content }
    } catch {
        return @{ ok = $false; body = $_.Exception.Message }
    }
}

function Read-DotEnvValue {
    param([string]$Key)
    $envFile = Join-Path $ServerRoot ".env"
    if (-not (Test-Path $envFile)) { return "" }
    $line = Get-Content $envFile | Where-Object { $_ -match ("^\s*" + [regex]::Escape($Key) + "\s*=") } | Select-Object -First 1
    if (-not $line) { return "" }
    return ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

function Get-LatestTunnelUrlFromLogs {
    Ensure-LogsDir
    $pattern = "https://[a-z0-9-]+\.trycloudflare\.com"
    $files = Get-ChildItem -Path $LogsDir -Filter "tunnel-*.log" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
    foreach ($file in $files) {
        $matches = Select-String -Path $file.FullName -Pattern $pattern -AllMatches -ErrorAction SilentlyContinue
        if ($matches) {
            return ($matches[-1].Matches[-1].Value)
        }
    }
    $saved = Join-Path $LogsDir "current-tunnel-url.txt"
    if (Test-Path $saved) {
        return (Get-Content $saved -Raw).Trim()
    }
    return ""
}

function Show-TunnelPublicUrl {
    param([string]$Url)
    if (-not $Url) { return }

    Ensure-LogsDir
    Set-Content -Path (Join-Path $LogsDir "current-tunnel-url.txt") -Value $Url -Encoding UTF8

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  YOUR APP URL (open in browser / phone)" -ForegroundColor Green
    Write-Host "  $Url" -ForegroundColor Yellow
    Write-Host "  API health: $Url/api/health" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  Copy this URL. It changes when you restart the tunnel." -ForegroundColor DarkGray
    Write-Host "  Quick check: npm run tunnel:url" -ForegroundColor DarkGray
    Write-Host ""
}
