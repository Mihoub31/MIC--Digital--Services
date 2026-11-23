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
const piAgent = require('./pi-agent');
const graphAgent = require('./graph-agent');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET is missing or too short in .env');
}

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const adminDir = path.join(__dirname, '..', 'admin');

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  frameguard: { action: 'deny' }
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

app.use(['/api', '/admin'], (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next();

  let originHost = null;
  try {
    originHost = new URL(origin).host;
  } catch {}

  if (!originHost || originHost !== req.get('host')) {
    return res.status(403).json({ error: 'Cross-origin request rejected.' });
  }

  next();
});

app.use(session({
  store: new SQLiteStore({
    db: 'sessions.sqlite',
    dir: process.env.MIC_DATA_DIR || path.join(__dirname, '..', 'database'),
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
  message: { error: 'محاولات كثيرة. حاول بعد 15 دقيقة.' }
});

app.use('/api', apiLimiter);

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
}

// Public website
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get('/site.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'site.js'));
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
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });
    }

    const user = db.prepare(
      'SELECT id, username, password_hash FROM admin_users WHERE username = ?'
    ).get(username);

    const valid = user
      ? await bcrypt.compare(password, user.password_hash)
      : await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid');

    if (!valid || !user) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
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

// Protect every admin file except the login page and its script
app.use('/admin', (req, res, next) => {
  if (req.path === '/login.html' || req.path === '/login.js') return next();
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
  const deleteSql = {
    clients: "DELETE FROM clients WHERE id = ?",
    requests: "DELETE FROM requests WHERE id = ?",
    projects: "DELETE FROM projects WHERE id = ?"
  }[req.params.type];

  const id = Number(req.params.id);
  if (!deleteSql) return res.status(404).json({ error: "Unknown data type" });
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid record ID" });
  }

  try {
    const result = db.prepare(deleteSql).run(id);
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

const piLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

const graphLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 1,
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
app.get('/api/agent/audit/history', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, model, files_analyzed AS filesAnalyzed,
             skipped_files AS skippedFiles,
             characters_reviewed AS charactersReviewed,
             report, created_at AS createdAt
      FROM audit_history
      ORDER BY id DESC
      LIMIT 20
    `).all();

    res.json({
      ok: true,
      history: rows.map(row => ({
        ...row,
        skippedFiles: JSON.parse(row.skippedFiles)
      }))
    });
  } catch (error) {
    console.error('Audit history error:', error.message);
    res.status(500).json({ ok: false, error: 'Could not load audit history' });
  }
});

// Protected read-only MIC Project Audit
app.post('/api/agent/audit', requireAdmin, agentLimiter, async (req, res) => {
  try {
    const result = await agent.analyzeProject();
    const analysis = result.analysis || {};
    const model = analysis.model || '';
    const report = typeof analysis.answer === 'string'
      ? analysis.answer
      : JSON.stringify(analysis);

    db.prepare(`
      INSERT INTO audit_history
        (model, files_analyzed, skipped_files, characters_reviewed, report)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      model,
      Number(result.filesAnalyzed) || 0,
      JSON.stringify(result.skippedFiles || []),
      Number(result.charactersReviewed) || 0,
      report
    );

    db.prepare(`
      DELETE FROM audit_history
      WHERE id NOT IN (
        SELECT id FROM audit_history ORDER BY id DESC LIMIT 20
      )
    `).run();

    res.json(result);
  } catch (error) {
    console.error('Project audit error:', error.message);
    res.status(500).json({ ok: false, error: 'Project audit failed' });
  }
});
// Protected pi agent runs (read-only, no tools)
app.get('/api/agent/runs', requireAdmin, (req, res) => {
  if (!piAgent.isEnabled()) {
    return res.status(404).json({ error: 'Agent is disabled.' });
  }

  res.json({ ok: true, runs: piAgent.listRuns(20) });
});

app.post('/api/agent/runs', requireAdmin, piLimiter, async (req, res) => {
  if (!piAgent.isEnabled()) {
    return res.status(404).json({ error: 'Agent is disabled.' });
  }

  try {
    const run = await piAgent.startRun(req.body && req.body.prompt);
    res.status(202).json({ ok: true, run });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) {
      console.error('Agent start error:', error.message);
    }
    res.status(status).json({ error: error.message });
  }
});

app.get('/api/agent/runs/:id', requireAdmin, (req, res) => {
  if (!piAgent.isEnabled()) {
    return res.status(404).json({ error: 'Agent is disabled.' });
  }

  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid run ID' });
  }

  const run = piAgent.getRun(id);
  if (!run) {
    return res.status(404).json({ error: 'Run not found' });
  }

  res.json({ ok: true, run });
});

// graphify is a local tool: install status is checked on each call
app.post('/api/agent/graph/build', requireAdmin, graphLimiter, (req, res) => {
  if (!graphAgent.isAvailable()) {
    return res.status(404).json({ error: 'Graphify is not installed.' });
  }

  try {
    const build = graphAgent.startBuild();
    res.status(202).json({ ok: true, build });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) {
      console.error('Graph build error:', error.message);
    }
    res.status(status).json({ error: error.message });
  }
});

app.get('/api/agent/graph/latest', requireAdmin, (req, res) => {
  if (!graphAgent.isAvailable()) {
    return res.status(404).json({ error: 'Graphify is not installed.' });
  }

  res.json({ ok: true, build: graphAgent.getLatest() || null });
});

app.get('/api/agent/graph/view', requireAdmin, (req, res) => {
  if (!graphAgent.isAvailable()) {
    return res.status(404).json({ error: 'Graphify is not installed.' });
  }

  const file = graphAgent.getViewerFile();
  if (!file) {
    return res.status(404).json({ error: 'No local viewer is available.' });
  }

  res.set(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:"
  );
  res.sendFile(file);
});

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error.message);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'حدث خطأ داخلي في الخادم.' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`MIC Digital Services running on http://${HOST}:${PORT}`);
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
