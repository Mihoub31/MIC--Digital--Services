require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

// Security headers.
// CSP will be configured after migrating inline scripts and styles.
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: '100kb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

app.use('/api', apiLimiter);

// Main website
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

// API status
app.get('/api/status', (req, res) => {
  res.json({
    app: 'MIC Digital Services',
    status: 'online',
    version: '1.0.0'
  });
});

// Unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found'
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`MIC Digital Services running on port ${PORT}`);
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('Shutting down MIC Digital Services...');

  server.close((err) => {
    if (err) {
      console.error('Shutdown error:', err);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
