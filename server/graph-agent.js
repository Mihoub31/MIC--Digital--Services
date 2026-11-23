const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../database/db');
const agent = require('./agent');

const ROOT = path.resolve(__dirname, '..');
const DATA_KEY = (path.basename(process.env.MIC_DATA_DIR || 'default') || 'default')
  .replace(/[^a-zA-Z0-9._-]/g, '_');
const BUILDS_DIR = path.join(ROOT, 'artifacts', 'graphify', DATA_KEY);
const DEFAULT_BIN = path.join(ROOT, 'services', 'uv-bin', 'graphify.exe');

const TIMEOUT_MS = clamp(Number(process.env.GRAPHIFY_TIMEOUT_MS) || 600000, 1000, 900000);
const MAX_STDOUT_BYTES = 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_REPORT_BYTES = 200 * 1024;
const MAX_BUILDS = 10;
const EXTERNAL_URL = /(?:src|href)\s*=\s*["']\s*https?:\/\/|url\(\s*["']?\s*https?:\/\//i;

let active = false;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function resolveGraphify() {
  const custom = process.env.GRAPHIFY_BIN;

  if (custom) {
    if (/\.(c|m)?js$/i.test(custom)) {
      return { command: process.execPath, args: [custom], check: custom };
    }
    return { command: custom, args: [], check: custom };
  }

  return { command: DEFAULT_BIN, args: [], check: DEFAULT_BIN };
}

function isAvailable() {
  return fs.existsSync(resolveGraphify().check);
}

function childEnv() {
  const keys = [
    'PATH', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP', 'USERPROFILE',
    'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA'
  ];
  const env = {};

  for (const key of keys) {
    if (process.env[key]) env[key] = process.env[key];
  }

  env.NO_COLOR = '1';
  env.PYTHONIOENCODING = 'utf-8';
  return env;
}

function killTree(child) {
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], {
        windowsHide: true,
        stdio: 'ignore'
      }).on('error', () => {});
      return;
    }
    child.kill('SIGKILL');
  } catch {}
}

function runProcess(command, args, { cwd, timeoutMs }) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
      env: childEnv(),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, Math.max(1000, timeoutMs));

    child.stdout.on('data', chunk => {
      if (stdout.length < MAX_STDOUT_BYTES) stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', chunk => {
      if (stderr.length < MAX_STDERR_BYTES) stderr += chunk.toString('utf8');
    });

    function settle(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stdout, stderr, timedOut });
    }

    child.once('error', error => settle({ code: null, spawnError: error.message }));
    child.once('close', code => settle({ code, spawnError: '' }));
  });
}

function runCapture(command, args, { cwd, timeoutMs, maxBytes = 64 * 1024 * 1024 }) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
      env: childEnv(),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const chunks = [];
    let size = 0;
    let stderr = '';
    let timedOut = false;
    let overflow = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, Math.max(1000, timeoutMs));

    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        overflow = true;
        killTree(child);
        return;
      }
      chunks.push(chunk);
    });

    child.stderr.on('data', chunk => {
      if (stderr.length < MAX_STDERR_BYTES) stderr += chunk.toString('utf8');
    });

    function settle(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stdout: Buffer.concat(chunks), stderr, timedOut, overflow });
    }

    child.once('error', error => settle({ code: null, spawnError: error.message }));
    child.once('close', code => settle({ code, spawnError: '' }));
  });
}

function extractTar(buffer, targetDir, timeoutMs) {
  const posixTarget = targetDir.split(path.sep).join('/');

  return new Promise(resolve => {
    const child = spawn('tar', ['-xf', '-', '-C', posixTarget], {
      cwd: ROOT,
      env: childEnv(),
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, Math.max(1000, timeoutMs));

    child.stderr.on('data', chunk => {
      if (stderr.length < MAX_STDERR_BYTES) stderr += chunk.toString('utf8');
    });

    function settle(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stderr, timedOut });
    }

    child.once('error', error => settle({ code: null, spawnError: error.message }));
    child.once('close', code => settle({ code, spawnError: '' }));
    child.stdin.on('error', () => {});
    child.stdin.end(buffer);
  });
}

async function createMirror(buildDir, remainingMs) {
  const mirrorDir = path.join(buildDir, 'mirror');
  await fsp.mkdir(mirrorDir, { recursive: true });

  const archive = await runCapture(
    'git', ['archive', '--format=tar', 'HEAD'],
    { cwd: ROOT, timeoutMs: remainingMs() }
  );

  if (archive.timedOut) throw statusError(504, 'Source mirror creation timed out.');
  if (archive.spawnError) throw statusError(500, `Unable to run git: ${archive.spawnError}`);
  if (archive.overflow) throw statusError(500, 'The source archive exceeded the size limit.');
  if (archive.code !== 0) {
    const detail = archive.stderr.trim().slice(0, 300);
    throw statusError(500, `Unable to create the source mirror from HEAD. ${detail}`.trim());
  }

  const extract = await extractTar(archive.stdout, mirrorDir, remainingMs());

  if (extract.timedOut) throw statusError(504, 'Source mirror extraction timed out.');
  if (extract.spawnError) throw statusError(500, `Unable to run tar: ${extract.spawnError}`);
  if (extract.code !== 0) {
    const detail = extract.stderr.trim().slice(0, 300);
    throw statusError(500, `Unable to extract the source mirror. ${detail}`.trim());
  }

  return mirrorDir;
}

async function runGraphify(mirrorDir, args, remainingMs) {
  const { command, args: prefix } = resolveGraphify();
  const result = await runProcess(command, [...prefix, ...args], {
    cwd: mirrorDir,
    timeoutMs: remainingMs()
  });

  if (result.timedOut) {
    const error = new Error(`Graphify exceeded ${TIMEOUT_MS} ms.`);
    error.status = 504;
    throw error;
  }

  if (result.spawnError) {
    throw statusError(500, `Unable to run graphify: ${result.spawnError}`);
  }

  if (result.code !== 0) {
    const detail = agent.redactSecrets(result.stderr.trim()).slice(0, 1000);
    throw statusError(500, `graphify exited with code ${result.code}. ${detail}`.trim());
  }
}

async function readOutputs(mirrorDir) {
  const source = path.join(mirrorDir, 'graphify-out');
  const files = {
    graphJson: path.join(source, 'graph.json'),
    report: path.join(source, 'GRAPH_REPORT.md'),
    html: path.join(source, 'graph.html')
  };

  const missing = Object.values(files).some(file => !fs.existsSync(file));
  if (missing) {
    throw statusError(500, 'graphify did not produce graph.json, GRAPH_REPORT.md and graph.html.');
  }

  const [json, report, html] = await Promise.all([
    fsp.stat(files.graphJson),
    fsp.readFile(files.report, 'utf8'),
    fsp.readFile(files.html, 'utf8')
  ]);

  if (json.size > MAX_HTML_BYTES || html.length > MAX_HTML_BYTES) {
    throw statusError(500, 'graphify output exceeded the size limit.');
  }

  return {
    report: report.slice(0, MAX_REPORT_BYTES),
    html: html.slice(0, MAX_HTML_BYTES),
    external: EXTERNAL_URL.test(html)
  };
}

async function publish(buildDir, mirrorDir) {
  const source = path.join(mirrorDir, 'graphify-out');
  const targets = {
    'graph.json': path.join(buildDir, 'graph.json'),
    'GRAPH_REPORT.md': path.join(buildDir, 'GRAPH_REPORT.md'),
    'graph.html': path.join(buildDir, 'graph.html')
  };

  for (const [name, target] of Object.entries(targets)) {
    await fsp.copyFile(path.join(source, name), target);
  }
}

async function pruneBuilds() {
  const stale = db.prepare(`
    SELECT id FROM graph_builds ORDER BY id DESC LIMIT -1 OFFSET ?
  `).all(MAX_BUILDS);

  for (const row of stale) {
    await fsp.rm(path.join(BUILDS_DIR, String(row.id)), {
      recursive: true,
      force: true
    }).catch(() => {});
  }
}

async function finishBuild(id, status, report, htmlPath, durationMs, error) {
  db.prepare(`
    UPDATE graph_builds
    SET status = ?, report = ?, html_path = ?, duration_ms = ?, error = ?, finished_at = ?
    WHERE id = ?
  `).run(
    status,
    agent.redactSecrets(report || ''),
    htmlPath,
    durationMs,
    agent.redactSecrets(String(error || '')).slice(0, 2000),
    new Date().toISOString(),
    id
  );

  await pruneBuilds();
}

async function execute(id, buildDir) {
  const started = Date.now();
  const deadline = started + TIMEOUT_MS;
  const remainingMs = () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      const error = new Error(`Graphify exceeded ${TIMEOUT_MS} ms.`);
      error.status = 504;
      throw error;
    }
    return remaining;
  };

  let status = 'succeeded';
  let report = '';
  let htmlPath = '';
  let error = '';

  try {
    const mirrorDir = await createMirror(buildDir, remainingMs);

    await runGraphify(mirrorDir, ['extract', '.', '--code-only', '--no-cluster'], remainingMs);
    await runGraphify(mirrorDir, ['cluster-only', '.', '--no-label'], remainingMs);

    const outputs = await readOutputs(mirrorDir);
    report = outputs.report;

    await publish(buildDir, mirrorDir);

    if (outputs.external) {
      status = 'rejected';
      error = 'graph.html references external resources; the viewer stays disabled.';
    } else {
      htmlPath = path.relative(ROOT, path.join(buildDir, 'graph.html'));
    }
  } catch (caught) {
    error = caught.message;
    status = caught.status === 504 ? 'timeout' : 'failed';
    try {
      const partial = await fsp.readFile(
        path.join(buildDir, 'mirror', 'graphify-out', 'GRAPH_REPORT.md'),
        'utf8'
      );
      report = partial.slice(0, MAX_REPORT_BYTES);
    } catch {}
  }

  await finishBuild(id, status, report, htmlPath, Date.now() - started, error);
}

function startBuild() {
  if (!isAvailable()) {
    throw statusError(404, 'Graphify is not installed.');
  }

  if (active) {
    throw statusError(409, 'A graph build is already in progress.');
  }

  active = true;
  let id = null;

  try {
    const inserted = db.prepare(`
      INSERT INTO graph_builds (status) VALUES ('running')
    `).run();
    id = Number(inserted.lastInsertRowid);

    const buildDir = path.join(BUILDS_DIR, String(id));

    execute(id, buildDir)
      .catch(caught => console.error('Graph build error:', caught.message))
      .finally(() => {
        active = false;
      });

    return getBuild(id);
  } catch (error) {
    active = false;
    if (id) {
      db.prepare(`
        UPDATE graph_builds SET status = 'failed', error = ?, finished_at = ? WHERE id = ?
      `).run(error.message, new Date().toISOString(), id);
    }
    throw error;
  }
}

function getBuild(id) {
  return db.prepare(`
    SELECT id, status, report, html_path AS htmlPath,
           duration_ms AS durationMs, error,
           created_at AS createdAt, finished_at AS finishedAt
    FROM graph_builds
    WHERE id = ?
  `).get(id);
}

function getLatest() {
  return db.prepare(`
    SELECT id, status, report, html_path AS htmlPath,
           duration_ms AS durationMs, error,
           created_at AS createdAt, finished_at AS finishedAt
    FROM graph_builds
    ORDER BY id DESC
    LIMIT 1
  `).get();
}

function getViewerFile() {
  const row = db.prepare(`
    SELECT html_path AS htmlPath
    FROM graph_builds
    WHERE status = 'succeeded' AND html_path <> ''
    ORDER BY id DESC
    LIMIT 1
  `).get();

  if (!row) return null;

  const file = path.resolve(ROOT, row.htmlPath);

  if (!file.startsWith(BUILDS_DIR + path.sep) || !fs.existsSync(file)) {
    return null;
  }

  return file;
}

module.exports = {
  isAvailable,
  startBuild,
  getLatest,
  getViewerFile
};
