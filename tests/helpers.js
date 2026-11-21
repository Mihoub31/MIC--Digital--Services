const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEST_SECRET = 'mic-test-secret-'.padEnd(64, 'x');
const ADMIN_USER = 'test_admin';
const ADMIN_PASSWORD = 'Test-Admin-2026!';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = new Error('Server did not start');

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  throw lastError;
}

async function startServer({ dataDir, port, env = {} }) {
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      SESSION_SECRET: TEST_SECRET,
      MIC_DATA_DIR: dataDir,
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  const exited = new Promise(resolve => child.once('exit', resolve));
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForHealth(baseUrl);
  } catch (error) {
    child.kill('SIGKILL');
    await exited;
    throw new Error(`Server failed to start.\n${output}`);
  }

  return {
    child,
    baseUrl,
    port,
    output: () => output,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      const timedOut = await Promise.race([
        exited.then(() => false),
        new Promise(resolve => setTimeout(() => resolve(true), 8000))
      ]);
      if (timedOut && child.exitCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
    }
  };
}

function makeTempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mic-test-'));
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function createAdmin(dataDir, username = ADMIN_USER, password = ADMIN_PASSWORD) {
  const result = spawnSync(process.execPath, ['scripts/create-admin.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      MIC_DATA_DIR: dataDir,
      MIC_ADMIN_USERNAME: username,
      MIC_ADMIN_PASSWORD: password
    },
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(`create-admin failed: ${result.stdout}${result.stderr}`);
  }

  return { username, password };
}

function createClient(baseUrl) {
  const cookies = new Map();

  async function request(pathname, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookies.size) {
      headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }

    const response = await fetch(baseUrl + pathname, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'manual'
    });

    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const index = pair.indexOf('=');
      if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }

    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}

    return { status: response.status, headers: response.headers, text, json };
  }

  return { request, cookies };
}

function sha256(relativePaths) {
  const hashes = new Map();

  for (const relativePath of relativePaths) {
    hashes.set(
      relativePath,
      crypto.createHash('sha256')
        .update(fs.readFileSync(path.join(ROOT, relativePath)))
        .digest('hex')
    );
  }

  return hashes;
}

module.exports = {
  ROOT,
  ADMIN_USER,
  ADMIN_PASSWORD,
  TEST_SECRET,
  getFreePort,
  startServer,
  makeTempDataDir,
  removeDir,
  createAdmin,
  createClient,
  sha256
};
