# Sidecar Resources

Place the following binaries in the platform-specific directories before building:

## darwin/
- `mongod` — MongoDB Community Server binary (macOS arm64)
- `backend` — PyInstaller-packaged FastAPI backend executable

## win32/
- `mongod.exe` — MongoDB Community Server binary (Windows x64)
- `backend.exe` — PyInstaller-packaged FastAPI backend executable

## linux/
- `mongod` — MongoDB Community Server binary (Linux x64)
- `backend` — PyInstaller-packaged FastAPI backend executable

These are populated by build scripts (see scripts/ directory, added in later steps).
