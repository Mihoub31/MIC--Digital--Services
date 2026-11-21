const fs = require('fs').promises;
const path = require('path');
const { ALLOWED_FILES, MAX_FILE_BYTES, MAX_TOTAL_CHARS } = require('./project-scope');

const ROOT = path.resolve(__dirname, '..');
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, info: 3 };
const PROTECTED_PREFIXES = ['/api/admin', '/api/agent', '/api/ai'];

function findLine(content, regex) {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (regex.test(lines[index])) return index + 1;
  }
  return null;
}

function lineAt(content, lineNumber) {
  if (!lineNumber) return '';
  const line = content.split(/\r?\n/)[lineNumber - 1] || '';
  return line.trim().slice(0, 170);
}

function redactEvidence(text) {
  return String(text || '').replace(
    /((?:password|secret|token|api[_-]?key)\s*[:=]\s*)(['"])[^'"]{4,}\2/gi,
    '$1$2[REDACTED]$2'
  );
}

async function loadScope() {
  const files = [];
  const skipped = [];
  let charactersReviewed = 0;
  let totalBytes = 0;

  for (const relativePath of ALLOWED_FILES) {
    try {
      const fullPath = path.resolve(ROOT, relativePath);

      if (!fullPath.startsWith(ROOT + path.sep)) {
        throw new Error('path outside project');
      }

      const stat = await fs.stat(fullPath);

      if (!stat.isFile()) throw new Error('not a regular file');
      if (stat.size > MAX_FILE_BYTES) throw new Error('exceeds per-file limit');
      if (totalBytes + stat.size > MAX_TOTAL_CHARS) {
        throw new Error('project size limit reached');
      }

      const content = await fs.readFile(fullPath, 'utf8');
      totalBytes += content.length;
      charactersReviewed += content.length;

      files.push({ path: relativePath, size: stat.size, content });
    } catch (error) {
      skipped.push(`${relativePath} (${error.message})`);
    }
  }

  return { files, skipped, filesAnalyzed: files.length, charactersReviewed };
}

function createCollector(findings) {
  return function add({ severity, category, file, line, evidence, explanation, remediation, status }) {
    findings.push({
      id: findings.length + 1,
      severity,
      category,
      file,
      line: line || null,
      evidence: redactEvidence(evidence || ''),
      explanation,
      remediation,
      verificationStatus: status || 'confirmed'
    });
  };
}

function checkEnvironment(add, context) {
  const { gitignore, server } = context;

  if (/^\s*\.env\s*$/m.test(gitignore || '')) {
    add({
      severity: 'info',
      category: 'secrets',
      file: '.gitignore',
      line: findLine(gitignore, /^\s*\.env\s*$/m),
      evidence: '.env',
      explanation: 'The local environment file is excluded from version control.',
      remediation: 'Keep this rule in place and never commit real secrets.',
      status: 'confirmed'
    });
  } else {
    add({
      severity: 'high',
      category: 'secrets',
      file: '.gitignore',
      line: null,
      evidence: gitignore ? 'No .env entry found' : '.gitignore missing',
      explanation: 'The environment file is not ignored by git and could be committed.',
      remediation: 'Add .env to .gitignore before any commit.',
      status: 'confirmed'
    });
  }

  if (context.envFileExists) {
    add({
      severity: 'info',
      category: 'secrets',
      file: '.env',
      line: null,
      evidence: '.env file present locally (content never read)',
      explanation: 'Runtime configuration is stored in a local file outside the audit scope.',
      remediation: 'Keep file permissions restricted and rotate secrets if exposed.',
      status: 'confirmed'
    });
  } else if (server) {
    add({
      severity: 'high',
      category: 'secrets',
      file: '.env',
      line: null,
      evidence: 'Local .env file not found',
      explanation: 'The server refuses to start without SESSION_SECRET, so configuration is incomplete.',
      remediation: 'Create .env from .env.example with a random secret of at least 32 characters.',
      status: 'confirmed'
    });
  }
}

function checkServerRules(add, context) {
  const { server, contentOf } = context;
  if (!server) return;

  const sessionLine = findLine(server, /app\.use\(\s*session\(/);
  const cookieLine = findLine(server, /cookie\s*:\s*\{/);

  if (/SESSION_SECRET\.length\s*<\s*32/.test(server)) {
    add({
      severity: 'info',
      category: 'session',
      file: 'server/server.js',
      line: findLine(server, /SESSION_SECRET\.length\s*<\s*32/),
      evidence: lineAt(server, findLine(server, /if\s*\(!process\.env\.SESSION_SECRET/)),
      explanation: 'The server refuses to start when SESSION_SECRET is missing or shorter than 32 characters.',
      remediation: 'Keep the minimum length and use a random value.',
      status: 'confirmed'
    });
  } else {
    add({
      severity: 'high',
      category: 'session',
      file: 'server/server.js',
      line: sessionLine,
      evidence: lineAt(server, sessionLine),
      explanation: 'No minimum length check for SESSION_SECRET was found in the source.',
      remediation: 'Throw at startup when SESSION_SECRET is missing or shorter than 32 characters.',
      status: 'confirmed'
    });
  }

  const cookieChecks = [
    [/httpOnly:\s*true/, 'httpOnly', 'high'],
    [/sameSite:\s*['"]strict['"]/, 'sameSite=strict', 'medium'],
    [/secure:\s*process\.env\.NODE_ENV\s*===\s*['"]production['"]/, 'secure in production', 'medium'],
    [/saveUninitialized:\s*false/, 'saveUninitialized=false', 'low'],
    [/SQLiteStore|store\s*:/, 'persistent session store', 'medium']
  ];

  const missingCookieFlags = cookieChecks
    .filter(([regex]) => !regex.test(server))
    .map(([, label]) => label);

  if (missingCookieFlags.length) {
    add({
      severity: 'medium',
      category: 'session',
      file: 'server/server.js',
      line: cookieLine,
      evidence: lineAt(server, cookieLine),
      explanation: `Session cookie hardening is incomplete: ${missingCookieFlags.join(', ')} not detected.`,
      remediation: 'Configure httpOnly, sameSite=strict, secure in production, saveUninitialized=false and a persistent store.',
      status: 'confirmed'
    });
  } else {
    add({
      severity: 'info',
      category: 'session',
      file: 'server/server.js',
      line: cookieLine,
      evidence: lineAt(server, cookieLine),
      explanation: 'Session cookies use httpOnly, sameSite=strict, secure in production and a SQLite store.',
      remediation: 'Keep these flags when modifying session configuration.',
      status: 'confirmed'
    });
  }

  const listenLine = findLine(server, /app\.listen\(/);
  const listenEvidence = lineAt(server, listenLine);
  const loopbackDefault = /process\.env\.HOST\s*\|\|\s*['"]127\.0\.0\.1['"]/.test(server);
  const listensAll = /app\.listen\([^)]*['"](0\.0\.0\.0|::)['"]/.test(server);
  const listensWithoutHost = /app\.listen\(\s*PORT\s*,?\s*\)/.test(server);

  if (listensAll || listensWithoutHost) {
    add({
      severity: 'medium',
      category: 'network',
      file: 'server/server.js',
      line: listenLine,
      evidence: listenEvidence,
      explanation: 'The HTTP server binds to every network interface, so the admin panel is reachable from the local network.',
      remediation: 'Bind to 127.0.0.1 by default and make wider binding an explicit opt-in.',
      status: 'confirmed'
    });
  } else {
    add({
      severity: 'info',
      category: 'network',
      file: 'server/server.js',
      line: listenLine,
      evidence: listenEvidence,
      explanation: loopbackDefault
        ? 'The server listens on loopback by default; wider exposure requires HOST to be set explicitly.'
        : 'The listen host is explicit in the source.',
      remediation: 'Only expose the server on the network when required and protected.',
      status: 'confirmed'
    });
  }

  const hasHelmet = /require\(['"]helmet['"]\)/.test(server) && /app\.use\(helmet/.test(server);
  const cspDisabled = /contentSecurityPolicy:\s*false/.test(server);

  if (!hasHelmet) {
    add({
      severity: 'high',
      category: 'headers',
      file: 'server/server.js',
      line: null,
      evidence: 'helmet not applied',
      explanation: 'Security headers (CSP, HSTS, nosniff, frameguard) are not configured.',
      remediation: 'Apply helmet with an explicit Content-Security-Policy.',
      status: 'confirmed'
    });
  } else if (cspDisabled) {
    add({
      severity: 'high',
      category: 'headers',
      file: 'server/server.js',
      line: findLine(server, /contentSecurityPolicy:\s*false/),
      evidence: lineAt(server, findLine(server, /contentSecurityPolicy:\s*false/)),
      explanation: 'Content-Security-Policy is explicitly disabled, removing a key XSS defense.',
      remediation: 'Enable a strict CSP and load scripts only from the application origin.',
      status: 'confirmed'
    });
  } else if (/directives\s*:\s*\{/.test(server)) {
    add({
      severity: 'info',
      category: 'headers',
      file: 'server/server.js',
      line: findLine(server, /directives\s*:\s*\{/),
      evidence: lineAt(server, findLine(server, /directives\s*:\s*\{/)),
      explanation: 'Helmet is enabled with explicit CSP directives.',
      remediation: 'Keep script sources restricted to the application origin.',
      status: 'confirmed'
    });
  } else {
    add({
      severity: 'low',
      category: 'headers',
      file: 'server/server.js',
      line: findLine(server, /app\.use\(helmet/),
      evidence: lineAt(server, findLine(server, /app\.use\(helmet/)),
      explanation: 'Helmet is enabled with default directives; an explicit policy is easier to review.',
      remediation: 'Declare CSP directives explicitly.',
      status: 'needs_review'
    });
  }

  if (/['"]unsafe-eval['"]/.test(server)) {
    add({
      severity: 'high',
      category: 'headers',
      file: 'server/server.js',
      line: findLine(server, /['"]unsafe-eval['"]/),
      evidence: lineAt(server, findLine(server, /['"]unsafe-eval['"]/)),
      explanation: 'CSP allows eval, which re-enables dynamic code execution in the browser.',
      remediation: 'Remove unsafe-eval and refactor the code that depends on it.',
      status: 'confirmed'
    });
  }

  if (/sameSite:\s*['"]none['"]/i.test(server)) {
    add({
      severity: 'high',
      category: 'session',
      file: 'server/server.js',
      line: findLine(server, /sameSite:\s*['"]none['"]/i),
      evidence: lineAt(server, findLine(server, /sameSite:\s*['"]none['"]/i)),
      explanation: 'sameSite=none exposes the session cookie to cross-site requests.',
      remediation: 'Use sameSite=strict or lax for an admin session.',
      status: 'confirmed'
    });
  }

  if (/function requireAdmin/.test(server) && /req\.session\.adminId/.test(server)) {
    add({
      severity: 'info',
      category: 'authentication',
      file: 'server/server.js',
      line: findLine(server, /function requireAdmin/),
      evidence: lineAt(server, findLine(server, /function requireAdmin/)),
      explanation: 'Administrator routes are guarded by a session check.',
      remediation: 'Keep requireAdmin on every /api/admin, /api/agent and /api/ai route.',
      status: 'confirmed'
    });
  } else {
    add({
      severity: 'high',
      category: 'authentication',
      file: 'server/server.js',
      line: null,
      evidence: 'requireAdmin guard not detected',
      explanation: 'Administrator authorization middleware was not found in the source.',
      remediation: 'Implement a session-based administrator guard.',
      status: 'confirmed'
    });
  }

  const routeRegex = /app\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"][^\n]*/g;
  let routeMatch;

  while ((routeMatch = routeRegex.exec(server)) !== null) {
    const [signature, , routePath] = routeMatch;

    if (!PROTECTED_PREFIXES.some(prefix => routePath.startsWith(prefix))) continue;

    if (!/requireAdmin/.test(signature)) {
      add({
        severity: 'high',
        category: 'authentication',
        file: 'server/server.js',
        line: findLine(server, new RegExp(`app\\.\\w+\\(\\s*['"]${routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`)),
        evidence: signature.trim().slice(0, 170),
        explanation: `Route ${routePath} is under a protected prefix but does not call requireAdmin.`,
        remediation: 'Add requireAdmin to this route.',
        status: 'confirmed'
      });
    }
  }

  if (/app\.use\(\s*['"]\/admin['"]/.test(server) && /adminId/.test(server)) {
    add({
      severity: 'info',
      category: 'authentication',
      file: 'server/server.js',
      line: findLine(server, /app\.use\(\s*['"]\/admin['"]/),
      evidence: lineAt(server, findLine(server, /app\.use\(\s*['"]\/admin['"]/)),
      explanation: 'Static admin pages require an authenticated session.',
      remediation: 'Keep public login assets limited to the login page.',
      status: 'confirmed'
    });
  }

  const limiterChecks = [
    ['/api/auth/login', 'loginLimiter'],
    ['/api/ai/chat', 'aiLimiter'],
    ['/api/agent/audit', 'agentLimiter'],
    ['/api/agent/read', 'agentLimiter'],
    ['/api/agent/analyze', 'agentLimiter']
  ];

  for (const [routePath, limiter] of limiterChecks) {
    const line = findLine(server, new RegExp(`['"]${routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));

    if (!line) continue;

    if (!lineAt(server, line).includes(limiter)) {
      add({
        severity: 'medium',
        category: 'rate-limiting',
        file: 'server/server.js',
        line,
        evidence: lineAt(server, line),
        explanation: `Route ${routePath} does not apply ${limiter}.`,
        remediation: `Apply ${limiter} to this route.`,
        status: 'confirmed'
      });
    }
  }

  if (/app\.use\(\s*['"]\/api['"]\s*,\s*apiLimiter\s*\)/.test(server)) {
    add({
      severity: 'info',
      category: 'rate-limiting',
      file: 'server/server.js',
      line: findLine(server, /app\.use\(\s*['"]\/api['"]\s*,\s*apiLimiter\s*\)/),
      evidence: lineAt(server, findLine(server, /app\.use\(\s*['"]\/api['"]\s*,\s*apiLimiter\s*\)/)),
      explanation: 'A global limiter covers the API surface, with stricter limiters on login and AI routes.',
      remediation: 'Keep sensitive routes under dedicated limiters.',
      status: 'confirmed'
    });
  }

  const sqlFiles = ['server/server.js', 'database/db.js'];
  let sawInterpolation = false;

  for (const file of sqlFiles) {
    const content = contentOf(file);
    if (!content) continue;

    const templateRegex = /db\.(prepare|exec)\(\s*`([^`]*\$\{[^`]*)`/g;
    let match;

    while ((match = templateRegex.exec(content)) !== null) {
      sawInterpolation = true;
      const dynamic = /req\.(body|query|params)/.test(match[2]);

      add({
        severity: dynamic ? 'high' : 'low',
        category: 'sql',
        file,
        line: findLine(content, /db\.(prepare|exec)\(\s*`/),
        evidence: match[2].trim().slice(0, 170),
        explanation: dynamic
          ? 'A SQL statement interpolates request data instead of using bound parameters.'
          : 'A SQL statement interpolates an identifier. Verify that the value comes from a fixed whitelist.',
        remediation: 'Use bound parameters and static SQL strings selected from a whitelist.',
        status: dynamic ? 'confirmed' : 'needs_review'
      });
    }
  }

  if (!sawInterpolation && /db\.prepare\(\s*['"]/.test(contentOf('server/server.js') || '')) {
    add({
      severity: 'info',
      category: 'sql',
      file: 'server/server.js',
      line: findLine(contentOf('server/server.js'), /db\.prepare\(\s*['"]/),
      evidence: 'Prepared statements with positional parameters',
      explanation: 'SQL statements use prepared statements with bound parameters.',
      remediation: 'Keep every user value as a bound parameter.',
      status: 'confirmed'
    });
  }

  if (/app\.use\(\s*\(\s*(error|err)\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/.test(server)) {
    const handlerIndex = server.search(/app\.use\(\s*\(\s*(error|err)\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/);
    const handlerBlock = server.slice(handlerIndex, handlerIndex + 600);
    const leaks = /res\.[^;\n]*\.(stack|message)/.test(handlerBlock);

    add({
      severity: leaks ? 'high' : 'info',
      category: 'error-handling',
      file: 'server/server.js',
      line: server.slice(0, handlerIndex).split(/\r?\n/).length,
      evidence: leaks ? 'Error details returned to the client' : 'Generic 500 response',
      explanation: leaks
        ? 'The error handler sends internal error details to the client.'
        : 'Unexpected errors are logged server-side and answered with a generic message.',
      remediation: 'Never return stack traces or raw error messages to clients.',
      status: 'confirmed'
    });
  } else {
    add({
      severity: 'medium',
      category: 'error-handling',
      file: 'server/server.js',
      line: null,
      evidence: 'No error middleware detected',
      explanation: 'Express default error handling may expose details depending on configuration.',
      remediation: 'Add a final error handler that returns a generic message.',
      status: 'confirmed'
    });
  }

  if (!/express\.json\(\s*\{\s*limit/.test(server)) {
    add({
      severity: 'medium',
      category: 'input-validation',
      file: 'server/server.js',
      line: findLine(server, /express\.json\(/),
      evidence: lineAt(server, findLine(server, /express\.json\(/)) || 'express.json without limit',
      explanation: 'The JSON body size limit is missing, allowing oversized payloads.',
      remediation: 'Set an explicit limit such as 100kb.',
      status: 'confirmed'
    });
  }

  if (/username\.length\s*>\s*100/.test(server)) {
    add({
      severity: 'info',
      category: 'input-validation',
      file: 'server/server.js',
      line: findLine(server, /username\.length\s*>\s*100/),
      evidence: lineAt(server, findLine(server, /username\.length\s*>\s*100/)),
      explanation: 'Login fields enforce maximum lengths and the login response does not reveal which field failed.',
      remediation: 'Keep generic authentication error messages.',
      status: 'confirmed'
    });
  }

  if (/prompt\.length\s*>\s*4000/.test(server)) {
    add({
      severity: 'info',
      category: 'input-validation',
      file: 'server/server.js',
      line: findLine(server, /prompt\.length\s*>\s*4000/),
      evidence: lineAt(server, findLine(server, /prompt\.length\s*>\s*4000/)),
      explanation: 'AI prompts are capped before being sent to the local model.',
      remediation: 'Keep prompt and audit input limits.',
      status: 'confirmed'
    });
  }

  if (contentOf('package.json') && /"bcryptjs"/.test(contentOf('package.json')) && /bcrypt\.compare/.test(server)) {
    const adminScript = contentOf('scripts/create-admin.js') || '';
    const costMatch = adminScript.match(/hashSync\(password,\s*(\d+)\)/);
    const cost = costMatch ? Number(costMatch[1]) : null;

    add({
      severity: cost !== null && cost < 10 ? 'medium' : 'info',
      category: 'password-hashing',
      file: 'scripts/create-admin.js',
      line: findLine(adminScript, /hashSync\(password,\s*(\d+)\)/),
      evidence: costMatch ? costMatch[0] : 'bcrypt.compare used at login',
      explanation: cost !== null && cost < 10
        ? 'The bcrypt cost factor is low for a production administrator account.'
        : 'Passwords are hashed with bcrypt and compared with a constant-time helper.',
      remediation: 'Use a bcrypt cost of 12 or higher.',
      status: 'confirmed'
    });
  }
}

function checkAgentRules(add, context) {
  const { contentOf } = context;
  const agent = contentOf('server/agent.js');
  if (!agent) return;

  const scope = contentOf('server/project-scope.js') || '';
  const allowlistBlock = (scope.match(/ALLOWED_FILES\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';

  if (/ALLOWED_FILES/.test(agent) && /\.includes\(/.test(agent)) {
    const forbidden = /['"]\.env['"]|\.sqlite|['"]backup\//.test(allowlistBlock);

    add({
      severity: forbidden ? 'high' : 'info',
      category: 'agent-scope',
      file: 'server/project-scope.js',
      line: findLine(scope, /ALLOWED_FILES\s*=\s*\[/),
      evidence: forbidden
        ? 'Allowlist references secrets or runtime data'
        : 'Explicit allowlist of source files',
      explanation: forbidden
        ? 'The agent allowlist could expose secrets, databases or backups.'
        : 'The agent can only read an explicit list of source files.',
      remediation: 'Never add .env, SQLite files or backup directories to the allowlist.',
      status: 'confirmed'
    });
  } else {
    add({
      severity: 'high',
      category: 'agent-scope',
      file: 'server/agent.js',
      line: null,
      evidence: 'No allowlist check detected',
      explanation: 'The file read endpoint does not verify that a path is allowlisted.',
      remediation: 'Restrict reads to an explicit allowlist.',
      status: 'confirmed'
    });
  }

  const writePrimitive = findLine(
    agent,
    /fs\.(writeFile|appendFile|unlink|rm|rename|mkdir|rmdir|chmod|truncate|copyFile|createWriteStream)\s*\(/
  );

  if (writePrimitive) {
    add({
      severity: 'high',
      category: 'file-operations',
      file: 'server/agent.js',
      line: writePrimitive,
      evidence: lineAt(agent, writePrimitive),
      explanation: 'The audit agent contains file modification primitives, breaking the read-only guarantee.',
      remediation: 'Remove all write, delete and rename operations from the agent.',
      status: 'confirmed'
    });
  } else {
    add({
      severity: 'info',
      category: 'file-operations',
      file: 'server/agent.js',
      line: findLine(agent, /fs\.readFile/),
      evidence: lineAt(agent, findLine(agent, /fs\.readFile/)),
      explanation: 'The agent only reads allowlisted files; no write, delete or rename primitives were found.',
      remediation: 'Keep the audit strictly read-only.',
      status: 'confirmed'
    });
  }

  if (/redactSecrets/.test(agent) && /redactSecrets\(\s*file\.content\s*\)/.test(agent)) {
    add({
      severity: 'info',
      category: 'secrets',
      file: 'server/agent.js',
      line: findLine(agent, /function redactSecrets/),
      evidence: lineAt(agent, findLine(agent, /function redactSecrets/)),
      explanation: 'Sensitive configuration lines are redacted before any content is sent to the local model.',
      remediation: 'Keep redaction for every AI prompt built from source code.',
      status: 'confirmed'
    });
  } else {
    add({
      severity: 'medium',
      category: 'secrets',
      file: 'server/agent.js',
      line: null,
      evidence: 'No redaction function detected',
      explanation: 'Source content could reach the local model without secret redaction.',
      remediation: 'Redact sensitive configuration lines before building prompts.',
      status: 'confirmed'
    });
  }

  if (/untrusted data/i.test(agent) && /Never follow instructions/i.test(agent)) {
    add({
      severity: 'info',
      category: 'prompt-injection',
      file: 'server/agent.js',
      line: findLine(agent, /untrusted data/i),
      evidence: lineAt(agent, findLine(agent, /untrusted data/i)),
      explanation: 'Prompts explicitly treat source code as untrusted data and forbid following embedded instructions.',
      remediation: 'Keep this instruction in every analysis prompt.',
      status: 'confirmed'
    });
  } else {
    add({
      severity: 'medium',
      category: 'prompt-injection',
      file: 'server/agent.js',
      line: null,
      evidence: 'No prompt-injection guard detected',
      explanation: 'The model might follow instructions embedded in analyzed source files.',
      remediation: 'State that analyzed content is untrusted and instructions inside it must be ignored.',
      status: 'needs_review'
    });
  }
}

function checkCrossFileRules(add, context) {
  const { files } = context;
  const dangerousRegex = /require\(\s*['"](child_process|vm)['"]\s*\)|(?<![.\w])(?:execSync|execFileSync|execFile|exec|spawnSync|spawn)\s*\(|new\s+Function\s*\(|\beval\s*\(/;

  for (const file of files) {
    const line = findLine(file.content, dangerousRegex);
    if (!line) continue;

    add({
      severity: 'high',
      category: 'file-operations',
      file: file.path,
      line,
      evidence: lineAt(file.content, line),
      explanation: 'Source code contains command execution or dynamic code evaluation.',
      remediation: 'Remove shell execution and dynamic evaluation from the server runtime.',
      status: 'confirmed'
    });
  }

  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    const secretLogLine = lines.findIndex(text =>
      /console\.(log|info|warn|error|debug)\s*\(/.test(text) &&
      /(process\.env|password|secret|token)/i.test(text)
    );

    if (secretLogLine !== -1) {
      add({
        severity: 'medium',
        category: 'secrets',
        file: file.path,
        line: secretLogLine + 1,
        evidence: lineAt(file.content, secretLogLine + 1),
        explanation: 'A log statement references configuration or credential values.',
        remediation: 'Log events without secret values.',
        status: 'confirmed'
      });
    }

    const leakLine = findLine(file.content, /res\.(json|send)\([^;\n]*process\.env/);
    if (leakLine) {
      add({
        severity: 'high',
        category: 'secrets',
        file: file.path,
        line: leakLine,
        evidence: lineAt(file.content, leakLine),
        explanation: 'An HTTP response includes environment variables.',
        remediation: 'Return only explicit, non-sensitive fields.',
        status: 'confirmed'
      });
    }
  }
}

async function runStaticAnalysis() {
  const scope = await loadScope();
  const byPath = new Map(scope.files.map(file => [file.path, file.content]));
  const contentOf = name => byPath.get(name) || '';
  const findings = [];
  const add = createCollector(findings);

  let gitignore = '';
  try {
    gitignore = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8');
  } catch {}

  let envFileExists = false;
  try {
    envFileExists = (await fs.stat(path.join(ROOT, '.env'))).isFile();
  } catch {}

  const context = {
    files: scope.files,
    gitignore,
    envFileExists,
    contentOf,
    server: contentOf('server/server.js')
  };

  checkEnvironment(add, context);
  checkServerRules(add, context);
  checkAgentRules(add, context);
  checkCrossFileRules(add, context);

  findings.sort((a, b) => {
    const severityDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (severityDiff !== 0) return severityDiff;
    return `${a.file}:${a.line || 0}`.localeCompare(`${b.file}:${b.line || 0}`);
  });

  findings.forEach((finding, index) => {
    finding.id = index + 1;
  });

  const summary = {
    total: findings.length,
    confirmed: findings.filter(item => item.verificationStatus === 'confirmed' && item.severity !== 'info').length,
    needsReview: findings.filter(item => item.verificationStatus === 'needs_review').length,
    informational: findings.filter(item => item.verificationStatus === 'info' || item.severity === 'info').length,
    bySeverity: {
      high: findings.filter(item => item.severity === 'high').length,
      medium: findings.filter(item => item.severity === 'medium').length,
      low: findings.filter(item => item.severity === 'low').length,
      info: findings.filter(item => item.severity === 'info').length
    }
  };

  return {
    files: scope.files.map(file => ({ path: file.path, size: file.size })),
    skippedFiles: scope.skipped,
    filesAnalyzed: scope.filesAnalyzed,
    charactersReviewed: scope.charactersReviewed,
    findings,
    summary
  };
}

module.exports = { runStaticAnalysis };
