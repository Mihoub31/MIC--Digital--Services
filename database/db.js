const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = process.env.MIC_DATA_DIR || __dirname;
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'mic-digital-services.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    business TEXT DEFAULT '',
    email TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client TEXT NOT NULL,
    service TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'جديد',
    details TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    client TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'قيد التخطيط',
    delivery_date TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model TEXT NOT NULL DEFAULT '',
    files_analyzed INTEGER NOT NULL DEFAULT 0,
    skipped_files TEXT NOT NULL DEFAULT '[]',
    characters_reviewed INTEGER NOT NULL DEFAULT 0,
    report TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS agent_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL DEFAULT 'readonly',
    model TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    exit_code INTEGER,
    duration_ms INTEGER,
    output TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    sandbox_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS graph_builds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'running',
    report TEXT NOT NULL DEFAULT '',
    html_path TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER,
    error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT
  );
`);
module.exports = db;