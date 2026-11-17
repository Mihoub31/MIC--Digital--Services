require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const ollama = require('./ollama');
const agent = require('./agent');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET is missing or too short in .env');
}

const app = express();
const PORT = process.env.PORT || 3000;
const adminDir = path.join(__dirname, '..', 'admin');

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

app.use(session({
  store: new SQLiteStore({
    db: 'sessions.sqlite',
    dir: path.join(__dirname, '..', 'database'),
    table: 'sessions'
  }),
  name: 'mic_admin_session',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Ù…Ø­Ø§ÙˆÙ„Ø§Øª ÙƒØ«ÙŠØ±Ø©. Ø­Ø§ÙˆÙ„ Ø¨Ø¹Ø¯ 15 Ø¯Ù‚ÙŠÙ‚Ø©.' }
});

app.use('/api', apiLimiter);

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: 'ÙŠØ¬Ø¨ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø£ÙˆÙ„Ø§Ù‹.' });
}

// Public website
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'MIC Digital Services',
    status: 'running'
  });
});

// Public API status
app.get('/api/status', (req, res) => {
  res.json({
    app: 'MIC Digital Services',
    status: 'online',
    version: '1.0.0'
  });
});

// Login page
app.get('/admin/login', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.redirect('/admin/');
  }
  res.sendFile(path.join(adminDir, 'login.html'));
});

// Login endpoint
app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password || username.length > 100 || password.length > 200) {
      return res.status(401).json({ error: 'Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¯Ø®ÙˆÙ„ ØºÙŠØ± ØµØ­ÙŠØ­Ø©.' });
    }

    const user = db.prepare(
      'SELECT id, username, password_hash FROM admin_users WHERE username = ?'
    ).get(username);

    const valid = user
      ? await bcrypt.compare(password, user.password_hash)
      : await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid');

    if (!valid || !user) {
      return res.status(401).json({ error: 'Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø£Ùˆ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± ØºÙŠØ± ØµØ­ÙŠØ­Ø©.' });
    }

    req.session.regenerate((error) => {
      if (error) return next(error);

      req.session.adminId = user.id;
      req.session.adminUsername = user.username;

      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        res.json({ ok: true, username: user.username });
      });
    });
  } catch (error) {
    next(error);
  }
});

// Current authenticated admin
app.get('/api/auth/me', requireAdmin, (req, res) => {
  res.json({
    authenticated: true,
    username: req.session.adminUsername
  });
});

// Logout
app.post('/api/auth/logout', requireAdmin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('mic_admin_session', {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    });
    res.json({ ok: true });
  });
});

// Protect every admin file except the login page
app.use('/admin', (req, res, next) => {
  if (req.path === '/login.html') return next();
  if (req.session && req.session.adminId) return next();
  return res.redirect('/admin/login');
}, express.static(adminDir));


// Protected SQLite data API
const dataConfig = {
  clients: {
    list: "SELECT id, name, phone, business, email, created_at AS date FROM clients ORDER BY id DESC",
    insert: "INSERT INTO clients (name, phone, business, email) VALUES (?, ?, ?, ?)",
    fields: ["name", "phone", "business", "email"]
  },
  requests: {
    list: "SELECT id, client, service, status, details, created_at AS date FROM requests ORDER BY id DESC",
    insert: "INSERT INTO requests (client, service, status, details) VALUES (?, ?, ?, ?)",
    fields: ["client", "service", "status", "details"]
  },
  projects: {
    list: "SELECT id, name, client, status, delivery_date AS date FROM projects ORDER BY id DESC",
    insert: "INSERT INTO projects (name, client, status, delivery_date) VALUES (?, ?, ?, ?)",
    fields: ["name", "client", "status", "date"]
  }
};

function cleanField(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

app.get("/api/admin/:type", requireAdmin, (req, res) => {
  const config = dataConfig[req.params.type];
  if (!config) return res.status(404).json({ error: "Unknown data type" });

  try {
    const rows = db.prepare(config.list).all();
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error("Data read error:", error.message);
    res.status(500).json({ error: "Could not read data" });
  }
});

app.post("/api/admin/:type", requireAdmin, (req, res) => {
  const config = dataConfig[req.params.type];
  if (!config) return res.status(404).json({ error: "Unknown data type" });

  try {
    const values = config.fields.map(field =>
      cleanField(req.body[field], field === "details" ? 3000 : 500)
    );

    const requiredFields = {
      clients: ["name", "phone"],
      requests: ["client", "service"],
      projects: ["name", "client"]
    }[req.params.type];

    for (const field of requiredFields) {
      if (!cleanField(req.body[field])) {
        return res.status(400).json({ error: "Required fields are missing" });
      }
    }

    const result = db.prepare(config.insert).run(...values);
    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error("Data insert error:", error.message);
    res.status(500).json({ error: "Could not save data" });
  }
});

app.delete("/api/admin/:type/:id", requireAdmin, (req, res) => {
  const table = {
    clients: "clients",
    requests: "requests",
    projects: "projects"
  }[req.params.type];

  const id = Number(req.params.id);
  if (!table) return res.status(404).json({ error: "Unknown data type" });
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid record ID" });
  }

  try {
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    if (!result.changes) return res.status(404).json({ error: "Record not found" });
    res.json({ ok: true });
  } catch (error) {
    console.error("Data delete error:", error.message);
    res.status(500).json({ error: "Could not delete record" });
  }
});


// Protected local AI endpoints
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

app.get('/api/ai/status', requireAdmin, async (req, res) => {
  try {
    res.json({ ok: true, ...(await ollama.status()) });
  } catch (error) {
    res.status(503).json({
      ok: false,
      connected: false,
      error: 'Ollama is unavailable'
    });
  }
});

app.post('/api/ai/chat', requireAdmin, aiLimiter, async (req, res) => {
  try {
    const prompt = String(req.body.prompt || '').trim();

    if (!prompt || prompt.length > 4000) {
      return res.status(400).json({
        error: 'Prompt must contain 1 to 4000 characters'
      });
    }

    const result = await ollama.ask(prompt);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Local AI error:', error.message);
    res.status(503).json({ error: 'AI service unavailable' });
  }
});


// Protected read-only local agent endpoints
const agentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

app.get('/api/agent/files', requireAdmin, async (req, res) => {
  try {
    res.json({ ok: true, files: await agent.listFiles() });
  } catch (error) {
    console.error('Agent file listing error:', error.message);
    res.status(500).json({ error: 'Could not list allowed files' });
  }
});

app.post('/api/agent/read', requireAdmin, agentLimiter, async (req, res) => {
  try {
    const result = await agent.readFile(req.body.path);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Protected MIC Agent analysis
app.post('/api/agent/analyze', requireAdmin, agentLimiter, async (req, res) => {
  try {
    const result = await agent.analyzeFile(req.body.path);
    res.json(result);
  } catch (error) {
    console.error('Agent analysis error:', error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
});
// Protected MIC Project Audit
app.post('/api/agent/audit', requireAdmin, agentLimiter, async (req, res) => {
  try {
    const result = await agent.analyzeProject();
    res.json(result);
  } catch (error) {
    console.error('Project audit error:', error.message);
    res.status(500).json({ ok: false, error: 'Project audit failed' });
  }
});
// Unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error.message);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Ø­Ø¯Ø« Ø®Ø·Ø£ Ø¯Ø§Ø®Ù„ÙŠ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù….' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`MIC Digital Services running on port ${PORT}`);
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('Shutting down MIC Digital Services...');

  server.close((error) => {
    if (error) {
      console.error('Shutdown error:', error);
      process.exitCode = 1;
    }
    db.close();
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
