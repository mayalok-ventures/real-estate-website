# scripts/sync-secrets-to-cloudflare.ps1
# Automates uploading credentials from local .env to Cloudflare Secrets securely
# without printing sensitive values to the console.

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Sahyak CRM — Cloudflare Secrets Synchronizer" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify wrangler authentication
Write-Host "`n[1/3] Checking Wrangler authentication..." -ForegroundColor Yellow
try {
    $whoami = npx wrangler whoami 2>&1
    if ($whoami -match "You are not authenticated") {
        Write-Host "Wrangler is not authenticated. Launching browser login..." -ForegroundColor Yellow
        npx wrangler login
    } else {
        Write-Host "Wrangler authenticated successfully." -ForegroundColor Green
    }
} catch {
    Write-Host "Please authenticate Wrangler by running: npx wrangler login" -ForegroundColor Red
    exit 1
}

# 2. Check for .env file
Write-Host "`n[2/3] Reading credentials from .env file..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host "Error: .env file not found in current directory." -ForegroundColor Red
    exit 1
}

# Parse .env into a hashtable securely (handles multi-line private keys)
$envVars = @{}
$lines = Get-Content ".env"
$currentKey = $null
$currentVal = ""
$inQuotes = $false
$quoteChar = ""

foreach ($line in $lines) {
    if (-not $inQuotes) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        $eqIndex = $trimmed.IndexOf("=")
        if ($eqIndex -gt 0) {
            $key = $trimmed.Substring(0, $eqIndex).Trim()
            $val = $trimmed.Substring($eqIndex + 1).Trim()
            if ($val.StartsWith('"') -or $val.StartsWith("'")) {
                $quoteChar = $val.Substring(0, 1)
                if ($val.EndsWith($quoteChar) -and $val.Length -gt 1) {
                    $envVars[$key] = $val.Substring(1, $val.Length - 2)
                } else {
                    $inQuotes = $true
                    $currentKey = $key
                    $currentVal = $val.Substring(1) + "`n"
                }
            } else {
                $envVars[$key] = $val
            }
        }
    } else {
        if ($line.TrimEnd().EndsWith($quoteChar)) {
            $currentVal += $line.TrimEnd().Substring(0, $line.TrimEnd().Length - 1)
            $envVars[$currentKey] = $currentVal
            $inQuotes = $false
            $currentKey = $null
            $currentVal = ""
        } else {
            $currentVal += $line + "`n"
        }
    }
}

# List of secrets to sync
$secretKeys = @(
    "ADMIN_SECRET",
    "ADMIN_SESSION_SECRET",
    "ADMIN_EMAILS",
    "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL",
    "GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY",
    "GOOGLE_SEARCH_CONSOLE_SITE_URL"
)

# Fallback: if ADMIN_SESSION_SECRET is missing, default to ADMIN_SECRET
if (-not $envVars.ContainsKey("ADMIN_SESSION_SECRET") -and $envVars.ContainsKey("ADMIN_SECRET")) {
    $envVars["ADMIN_SESSION_SECRET"] = $envVars["ADMIN_SECRET"]
}

# 3. Upload secrets
Write-Host "`n[3/3] Uploading secrets to Cloudflare..." -ForegroundColor Yellow

foreach ($key in $secretKeys) {
    if ($envVars.ContainsKey($key) -and $envVars[$key]) {
        Write-Host "  -> Uploading secret: $key ... " -NoNewline -ForegroundColor Gray
        $value = $envVars[$key]
        $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "echo $value | npx wrangler secret put $key" -NoNewWindow -Wait -PassThru
        if ($process.ExitCode -eq 0) {
            Write-Host "OK" -ForegroundColor Green
        } else {
            Write-Host "FAILED (Exit Code $($process.ExitCode))" -ForegroundColor Red
        }
    } else {
        Write-Host "  -> Skipping $key (not present or empty in .env)" -ForegroundColor DarkGray
    }
}

Write-Host "`nAll configured secrets synchronized successfully!" -ForegroundColor Green
