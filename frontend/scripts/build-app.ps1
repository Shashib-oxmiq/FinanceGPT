# Build the FinanceGPT Electron desktop app (Windows).
# Prerequisites:
#   1. MongoDB binary in electron\resources\win32\mongod.exe
#   2. Backend executable in electron\resources\win32\backend.exe
#   3. npm install
# Usage: .\scripts\build-app.ps1 [-NoSidecar]

param([switch]$NoSidecar)

$FrontendDir = Split-Path -Parent $PSScriptRoot
$PlatformDir = "win32"

Write-Host "=== Building FinanceGPT Desktop App ($PlatformDir) ==="

# Check sidecar binaries
if (-not $NoSidecar) {
    $Mongod = Join-Path $FrontendDir "electron\resources\win32\mongod.exe"
    $Backend = Join-Path $FrontendDir "electron\resources\win32\backend.exe"

    if (-not (Test-Path $Mongod)) {
        Write-Host "WARNING: mongod.exe not found at $Mongod"
        Write-Host "Run: electron\scripts\download-mongodb.ps1"
        Write-Host "Continuing without MongoDB sidecar..."
    }
    if (-not (Test-Path $Backend)) {
        Write-Host "WARNING: backend.exe not found at $Backend"
        Write-Host "See: backend\BUILD.md for build instructions"
        Write-Host "Continuing without backend sidecar..."
    }
}

# Step 1: Install dependencies
Write-Host "=== Installing npm dependencies ==="
Push-Location $FrontendDir
npm install

# Step 2: Build the Vite frontend
Write-Host "=== Building frontend (Vite) ==="
npm run build

# Step 3: Build the Electron app
Write-Host "=== Building Electron app ==="
npx electron-builder --config electron-builder.yml

Pop-Location
Write-Host ""
Write-Host "=== Build complete ==="
Write-Host "Output: $FrontendDir\release\"