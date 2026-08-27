const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const http = require('http');
const fs = require('fs');
const { app } = require('electron');

const LOG_PREFIX = '[sidecar]';

class SidecarManager {
  constructor() {
    this.mongoProc = null;
    this.backendProc = null;
    this.mongoPort = 27017;
    this.backendPort = 8000;
    this.mongoPath = null;
    this.backendPath = null;
    this.dataDir = null;
    this.backendUrl = null;
    this.isStopping = false;
  }

  log(...args) {
    try {
      console.log(LOG_PREFIX, ...args);
    } catch (e) {
      // EPIPE: stdout pipe closed (parent process gone). Swallow — logging is best-effort.
      if (e.code !== 'EPIPE') throw e;
    }
  }

  resolvePaths() {
    const platform = process.platform;
    const exeSuffix = platform === 'win32' ? '.exe' : '';

    let resourcesDir;
    if (!app.isPackaged) {
      resourcesDir = path.join(__dirname, 'resources', platform);
    } else {
      resourcesDir = path.join(process.resourcesPath, 'sidecar');
    }

    const mongoPath = path.join(resourcesDir, `mongod${exeSuffix}`);
    const backendPath = path.join(resourcesDir, `backend${exeSuffix}`);

    this.mongoPath = fs.existsSync(mongoPath) ? mongoPath : null;
    this.backendPath = fs.existsSync(backendPath) ? backendPath : null;

    if (!this.mongoPath) {
      this.log(`MongoDB binary not found at ${mongoPath} — skipping Mongo sidecar`);
    }
    if (!this.backendPath) {
      this.log(`Backend binary not found at ${backendPath} — will try venv Python fallback`);
    }
  }

  async findFreePort(startPort) {
    for (let i = 0; i < 50; i++) {
      const port = startPort + i;
      const free = await new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.on('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => {
          server.close(() => resolve(true));
        });
      });
      if (free) return port;
    }
    // Fallback: let the OS pick a random port
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
    });
  }

  async waitForPort(port, timeoutMs = 10000) {
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      const tryConnect = () => {
        const socket = net.connect({ port, host: '127.0.0.1' });
        socket.once('connect', () => { socket.destroy(); resolve(); });
        socket.once('error', () => {
          socket.destroy();
          if (Date.now() - startTime >= timeoutMs) {
            reject(new Error(`${LOG_PREFIX} Timed out waiting for port ${port}`));
          } else {
            setTimeout(tryConnect, 500);
          }
        });
      };
      tryConnect();
    });
  }

  async waitForHealth(url, timeoutMs = 30000) {
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      const tryGet = () => {
        const req = http.get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else {
            if (Date.now() - startTime >= timeoutMs) {
              reject(new Error(`${LOG_PREFIX} Health check failed: status ${res.statusCode}`));
            } else {
              setTimeout(tryGet, 1000);
            }
          }
        });
        req.on('error', () => {
          if (Date.now() - startTime >= timeoutMs) {
            reject(new Error(`${LOG_PREFIX} Health check timed out at ${url}`));
          } else {
            setTimeout(tryGet, 1000);
          }
        });
      };
      tryGet();
    });
  }

  async startMongo() {
    if (!this.mongoPath) return;

    this.dataDir = path.join(app.getPath('userData'), 'mongodb-data');
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.log(`Using MongoDB data dir: ${this.dataDir}`);

    this.mongoProc = spawn(this.mongoPath, [
      '--dbpath', this.dataDir,
      '--port', String(this.mongoPort),
      '--bind_ip', '127.0.0.1',
      '--noauth',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    this.mongoProc.stdout.on('data', (data) => {
      // Only log non-JSON lines (JSON logs from mongod are too verbose)
      const s = data.toString().trimEnd();
      if (s && !s.startsWith('{')) this.log(`[mongod] ${s}`);
    });
    this.mongoProc.stderr.on('data', (data) => {
      const s = data.toString().trimEnd();
      if (s && !s.startsWith('{')) this.log(`[mongod] ${s}`);
    });
    this.mongoProc.on('exit', (code, signal) => {
      this.log(`MongoDB exited (code ${code ?? signal})`);
      this.mongoProc = null;
    });
    this.mongoProc.on('error', (err) => {
      this.log(`MongoDB spawn error: ${err.message}`);
      this.mongoProc = null;
    });

    this.log(`MongoDB starting on port ${this.mongoPort}`);
  }

  async startBackend() {
    const envFile = path.join(__dirname, 'resources', '.env');
    const extraEnv = {};
    if (fs.existsSync(envFile)) {
      const contents = fs.readFileSync(envFile, 'utf8');
      for (const line of contents.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (key) extraEnv[key] = value;
      }
      this.log(`Loaded ${Object.keys(extraEnv).length} key(s) from resources/.env`);
    }

    const backendEnv = {
      ...process.env,
      ...extraEnv,
      MONGO_URL: `mongodb://localhost:${this.mongoPort}`,
      DB_NAME: 'finchat_desktop',
      CORS_ORIGINS: `http://localhost:5173,http://localhost:${this.backendPort}`,
      FRONTEND_URL: 'http://localhost:5173',
    };

    if (this.backendPath && fs.existsSync(this.backendPath)) {
      // Production: PyInstaller binary
      this.backendProc = spawn(this.backendPath, ['--port', String(this.backendPort)], {
        env: backendEnv, stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.log(`Backend (PyInstaller) starting on port ${this.backendPort}`);
    } else {
      // Dev fallback: venv Python + uvicorn
      const backendDir = path.join(__dirname, '..', '..', 'backend');
      const venvPython = path.join(backendDir, '.venv', 'bin', 'python3');

      if (!fs.existsSync(venvPython)) {
        this.log('No PyInstaller binary and no .venv — backend sidecar disabled');
        return;
      }

      this.backendProc = spawn(venvPython, [
        '-m', 'uvicorn', 'server:app',
        '--host', '127.0.0.1', '--port', String(this.backendPort),
      ], {
        env: backendEnv, cwd: backendDir, stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.log(`Backend (venv Python) starting on port ${this.backendPort}`);
    }

    this.backendProc.stdout.on('data', (data) => this.log(`[backend] ${data.toString().trimEnd()}`));
    this.backendProc.stderr.on('data', (data) => this.log(`[backend] ${data.toString().trimEnd()}`));
    this.backendProc.on('exit', (code, signal) => {
      this.log(`Backend exited (code ${code ?? signal})`);
      this.backendProc = null;
    });
    this.backendProc.on('error', (err) => {
      this.log(`Backend spawn error: ${err.message}`);
      this.backendProc = null;
    });
  }

  async start() {
    this.resolvePaths();

    this.mongoPort = await this.findFreePort(27017);
    this.backendPort = await this.findFreePort(8000);
    this.log(`Resolved ports: mongo=${this.mongoPort}, backend=${this.backendPort}`);

    await this.startMongo();
    if (this.mongoProc) {
      await this.waitForPort(this.mongoPort, 10000);
      this.log('MongoDB is accepting connections');
    }

    await this.startBackend();
    if (this.backendProc) {
      await this.waitForHealth(`http://localhost:${this.backendPort}/api/`, 30000);
      this.log('Backend is healthy');
    }

    this.backendUrl = `http://localhost:${this.backendPort}`;
    this.log(`Sidecar started. Backend URL: ${this.backendUrl}`);
    return this.backendUrl;
  }

  // Kill a child process gracefully: SIGTERM → 3s → SIGKILL.
  // Never hangs — always resolves within 3.5s even if 'exit' never fires.
  async killProcess(proc) {
    if (!proc || proc.killed) return;

    return new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };

      proc.once('exit', done);

      try {
        proc.kill('SIGTERM');
      } catch {
        done();
        return;
      }

      // Hard fallback: SIGKILL after 3s
      setTimeout(() => {
        if (!settled) {
          try { proc.kill('SIGKILL'); } catch {}
          // Give the 'exit' event 500ms to fire, then resolve anyway
          setTimeout(done, 500);
        }
      }, 3000);

      // Absolute safety net: resolve no matter what after 4s
      setTimeout(done, 4000);
    });
  }

  async stop() {
    if (this.isStopping) return;
    this.isStopping = true;

    try {
      // Kill backend first, then MongoDB
      if (this.backendProc) {
        this.log('Stopping backend…');
        await this.killProcess(this.backendProc);
        this.backendProc = null;
      }
      if (this.mongoProc) {
        this.log('Stopping MongoDB…');
        await this.killProcess(this.mongoProc);
        this.mongoProc = null;
      }
      this.log('All sidecars stopped');
    } catch (err) {
      this.log(`Error during stop: ${err.message}`);
    } finally {
      this.isStopping = false;
    }
  }
}

module.exports = SidecarManager;