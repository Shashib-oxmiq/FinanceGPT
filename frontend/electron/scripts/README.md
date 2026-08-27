# Sidecar Build Scripts

## MongoDB

Download MongoDB Community Server binaries for your platform:

### macOS / Linux
```bash
cd electron/scripts
chmod +x download-mongodb.sh
./download-mongodb.sh         # downloads for current platform
./download-mongodb.sh --force # re-download even if exists
```

### Windows (PowerShell)
```powershell
cd electron\scripts
.\download-mongodb.ps1
.\download-mongodb.ps1 -Force
```

### Backend (PyInstaller)
See `../../backend/BUILD.md` for building the FastAPI backend executable.

## Directory Structure After Setup

```
electron/resources/
├── darwin/
│   ├── mongod          # macOS arm64
│   └── backend         # PyInstaller exe
├── win32/
│   ├── mongod.exe      # Windows x64
│   └── backend.exe     # PyInstaller exe
├── linux/
│   ├── mongod          # Linux x64
│   └── backend         # PyInstaller exe
├── mongod.conf         # Reference config
└── .env                # API keys (optional, created by user)
```

## .env File (Optional)

Place API keys in `electron/resources/.env` for the backend sidecar:
```
EMERGENT_LLM_KEY=your-key-here
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
```

This file is read by the sidecar manager at startup and passed as environment variables to the backend process.