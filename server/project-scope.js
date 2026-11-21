const MAX_FILE_BYTES = 30000;
const MAX_TOTAL_CHARS = 120000;

const ALLOWED_FILES = [
  'server/server.js',
  'server/ollama.js',
  'server/agent.js',
  'server/audit-static.js',
  'server/project-scope.js',
  'database/db.js',
  'admin/index.html',
  'admin/login.html',
  'admin/login.js',
  'admin/dashboard.js',
  'admin/ai.js',
  'admin/audit.js',
  'admin/panels.js',
  'scripts/create-admin.js',
  'package.json',
  'index.html',
  'site.js'
];

module.exports = { ALLOWED_FILES, MAX_FILE_BYTES, MAX_TOTAL_CHARS };
