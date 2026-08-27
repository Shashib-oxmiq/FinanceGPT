# Download MongoDB Community Server binary for the FinanceGPT desktop app (Windows).
# Usage: .\download-mongodb.ps1 [-Force]

param(
    [switch]$Force
)

$MONGODB_VERSION = "7.0.14"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ResourcesDir = Join-Path (Split-Path -Parent $ScriptDir) "resources"
$TargetDir = Join-Path $ResourcesDir "win32"
$Target = Join-Path $TargetDir "mongod.exe"

if ((Test-Path $Target) -and -not $Force) {
    Write-Host "mongod.exe already exists at $Target (use -Force to re-download)"
    exit 0
}

$Url = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-${MONGODB_VERSION}.zip"
$TempDir = Join-Path $env:TEMP "finchat-mongodb-download"

try {
    Write-Host "Downloading MongoDB $MONGODB_VERSION for Windows x86_64..."
    $ZipPath = Join-Path $TempDir "mongodb.zip"
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
    Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing

    Write-Host "Extracting..."
    Expand-Archive -Path $ZipPath -DestinationPath $TempDir -Force

    if (-not (Test-Path $TargetDir)) {
        New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
    }

    $Bin = Get-ChildItem -Path $TempDir -Recurse -Filter "mongod.exe" | Select-Object -First 1
    if (-not $Bin) {
        Write-Error "mongod.exe not found in archive"
        exit 1
    }
    Copy-Item $Bin.FullName $Target -Force
    Write-Host "Done: $Target"
}
catch {
    Write-Error "Failed: $_"
    exit 1
}
finally {
    if (Test-Path $TempDir) {
        Remove-Item -Recurse -Force $TempDir
    }
}