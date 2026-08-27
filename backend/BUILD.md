# Building the Backend Executable

## Prerequisites
- Python 3.11+
- `pip install -r requirements.txt`
- `pip install pyinstaller`

## Build (macOS)
```bash
cd backend
pyinstaller finchat.spec --clean --noconfirm
# Output: dist/backend
```

## Build (Windows)
```bash
cd backend
pyinstaller finchat.spec --clean --noconfirm
# Output: dist/backend.exe
```

## Build (Linux)
```bash
cd backend
pyinstaller finchat.spec --clean --noconfirm
# Output: dist/backend
```

## Post-build
Copy the executable to the Electron resources directory:
- macOS: `cp dist/backend ../frontend/electron/resources/darwin/backend`
- Windows: `copy dist\backend.exe ..\frontend\electron\resources\win32\backend.exe`
- Linux: `cp dist/backend ../frontend/electron/resources/linux/backend`

## Notes
- The `.env` file is NOT bundled. API keys are injected at runtime by the Electron sidecar manager.
- MongoDB is NOT bundled by PyInstaller — it's a separate sidecar.
- The executable accepts `--port <N>` to set the listening port.