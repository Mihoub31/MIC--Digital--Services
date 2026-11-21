const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ALLOWED_FILES } = require('../server/project-scope');
const helpers = require('./helpers');

describe('API et sécurité — MIC Digital Services', () => {
  let server;
  let anon;
  let dataDir;

  before(async () => {
    dataDir = helpers.makeTempDataDir();
    helpers.createAdmin(dataDir);
    const port = await helpers.getFreePort();
    server = await helpers.startServer({ dataDir, port });
    anon = helpers.createClient(server.baseUrl);
  });

  after(async () => {
    if (server) await server.stop();
    if (dataDir) helpers.removeDir(dataDir);
  });

  it('démarre et expose la santé et la page publique', async () => {
    const health = await anon.request('/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.service, 'MIC Digital Services');

    const home = await anon.request('/');
    assert.equal(home.status, 200);
    assert.match(home.text, /MIC Digital Services/);
  });

  it('applique une CSP stricte et masque les entêtes sensibles', async () => {
    const home = await anon.request('/');
    const csp = home.headers.get('content-security-policy');

    assert.ok(csp, 'Content-Security-Policy missing');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
    assert.equal(home.headers.get('x-powered-by'), null);
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal(home.headers.get('referrer-policy'), 'no-referrer');

    const status = await anon.request('/api/status');
    assert.equal(status.headers.get('cache-control'), 'no-store');

    const loginPage = await anon.request('/admin/login');
    assert.equal(loginPage.headers.get('cache-control'), 'no-store');
  });

  it('sert les scripts externalisés et protège le reste de /admin', async () => {
    const siteScript = await anon.request('/site.js');
    assert.equal(siteScript.status, 200);
    assert.match(siteScript.headers.get('content-type'), /javascript/);

    const loginScript = await anon.request('/admin/login.js');
    assert.equal(loginScript.status, 200);

    const loginPage = await anon.request('/admin/login');
    assert.equal(loginPage.status, 200);

    const dashboard = await anon.request('/admin/');
    assert.equal(dashboard.status, 302);
    assert.equal(dashboard.headers.get('location'), '/admin/login');

    const panelScript = await anon.request('/admin/panels.js');
    assert.equal(panelScript.status, 302);
  });

  it('refuse les API protégées sans session', async () => {
    const paths = [
      '/api/admin/clients',
      '/api/agent/files',
      '/api/agent/audit/history',
      '/api/ai/status'
    ];

    for (const pathname of paths) {
      const response = await anon.request(pathname);
      assert.equal(response.status, 401, pathname);
      assert.equal(typeof response.json.error, 'string', pathname);
    }

    const audit = await anon.request('/api/agent/audit', { method: 'POST', body: {} });
    assert.equal(audit.status, 401);
  });

  it('rejette les requêtes API cross-origin', async () => {
    const crossOrigin = await anon.request('/api/auth/login', {
      method: 'POST',
      headers: { Origin: 'http://evil.example' },
      body: { username: 'x', password: 'y' }
    });
    assert.equal(crossOrigin.status, 403);

    const sameOrigin = await anon.request('/api/auth/login', {
      method: 'POST',
      headers: { Origin: server.baseUrl },
      body: { username: 'nobody', password: 'wrong-password' }
    });
    assert.equal(sameOrigin.status, 401);
  });

  it('authentifie l’administrateur et pose un cookie de session strict', async () => {
    const wrong = await anon.request('/api/auth/login', {
      method: 'POST',
      body: { username: helpers.ADMIN_USER, password: 'wrong-password' }
    });
    assert.equal(wrong.status, 401);

    const login = await anon.request('/api/auth/login', {
      method: 'POST',
      body: { username: helpers.ADMIN_USER, password: helpers.ADMIN_PASSWORD }
    });
    assert.equal(login.status, 200);
    assert.deepEqual(login.json, { ok: true, username: helpers.ADMIN_USER });

    const cookie = login.headers.getSetCookie()
      .find(header => header.startsWith('mic_admin_session='));
    assert.ok(cookie, 'session cookie missing');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);

    const me = await anon.request('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.username, helpers.ADMIN_USER);
  });

  it('déconnecte puis permet une nouvelle connexion', async () => {
    const logout = await anon.request('/api/auth/logout', { method: 'POST' });
    assert.equal(logout.status, 200);

    const me = await anon.request('/api/auth/me');
    assert.equal(me.status, 401);

    const login = await anon.request('/api/auth/login', {
      method: 'POST',
      body: { username: helpers.ADMIN_USER, password: helpers.ADMIN_PASSWORD }
    });
    assert.equal(login.status, 200);
  });

  it('gère les clients avec validation et suppression', async () => {
    const missing = await anon.request('/api/admin/clients', {
      method: 'POST',
      body: { name: 'sans téléphone' }
    });
    assert.equal(missing.status, 400);

    const created = await anon.request('/api/admin/clients', {
      method: 'POST',
      body: {
        name: 'عميل تجريبي',
        phone: '0555000000',
        business: 'Test',
        email: 'test@example.com'
      }
    });
    assert.equal(created.status, 201);
    assert.ok(Number.isInteger(created.json.id));

    const list = await anon.request('/api/admin/clients');
    assert.equal(list.status, 200);
    assert.ok(list.json.data.some(item =>
      item.id === created.json.id && item.name === 'عميل تجريبي'
    ));

    const invalidId = await anon.request('/api/admin/clients/abc', { method: 'DELETE' });
    assert.equal(invalidId.status, 400);

    const deleted = await anon.request(`/api/admin/clients/${created.json.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);

    const deletedAgain = await anon.request(`/api/admin/clients/${created.json.id}`, { method: 'DELETE' });
    assert.equal(deletedAgain.status, 404);

    const unknownType = await anon.request('/api/admin/inconnu');
    assert.equal(unknownType.status, 404);
  });

  it('gère les projets avec validation et suppression', async () => {
    const created = await anon.request('/api/admin/projects', {
      method: 'POST',
      body: { name: 'مشروع تجريبي', client: 'عميل تجريبي', status: 'قيد التخطيط', date: '2026-12-01' }
    });
    assert.equal(created.status, 201);

    const deleted = await anon.request(`/api/admin/projects/${created.json.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
  });

  it('n’autorise que les fichiers de la liste blanche', async () => {
    const envFile = await anon.request('/api/agent/read', {
      method: 'POST',
      body: { path: '.env' }
    });
    assert.equal(envFile.status, 400);

    const traversal = await anon.request('/api/agent/read', {
      method: 'POST',
      body: { path: '../.env' }
    });
    assert.equal(traversal.status, 400);

    const allowed = await anon.request('/api/agent/read', {
      method: 'POST',
      body: { path: 'server/agent.js' }
    });
    assert.equal(allowed.status, 200);
    assert.match(allowed.json.content, /analyzeProject/);

    const files = await anon.request('/api/agent/files');
    assert.equal(files.status, 200);
    assert.equal(files.json.files.length, ALLOWED_FILES.length);
    assert.ok(files.json.files.every(file => ALLOWED_FILES.includes(file.path)));
  });

  it('exécute l’audit v3, le conserve et ne modifie aucun fichier', { timeout: 240000 }, async () => {
    const hashesBefore = helpers.sha256(ALLOWED_FILES);

    const audit = await anon.request('/api/agent/audit', { method: 'POST', body: {} });
    assert.equal(audit.status, 200);

    const data = audit.json;
    assert.equal(data.ok, true);
    assert.equal(data.filesAnalyzed, ALLOWED_FILES.length);
    assert.deepEqual(data.skippedFiles, []);
    assert.ok(data.charactersReviewed > 5000);
    assert.ok(Array.isArray(data.findings));
    assert.equal(data.summary.total, data.findings.length);

    const confirmed = data.findings.filter(item =>
      item.verificationStatus === 'confirmed' && item.severity !== 'info').length;
    const needsReview = data.findings.filter(item =>
      item.verificationStatus === 'needs_review').length;
    const informational = data.findings.filter(item =>
      item.verificationStatus === 'info' || item.severity === 'info').length;

    assert.equal(data.summary.confirmed, confirmed);
    assert.equal(data.summary.needsReview, needsReview);
    assert.equal(data.summary.informational, informational);
    assert.equal(
      data.summary.bySeverity.high + data.summary.bySeverity.medium +
      data.summary.bySeverity.low + data.summary.bySeverity.info,
      data.summary.total
    );

    assert.equal(typeof data.analysis, 'object');
    assert.match(data.analysis.model, /^MIC Static Audit v3/);
    for (const section of ['## Summary', '## Findings', '## Method and limits', '## AI recommendations']) {
      assert.ok(data.analysis.answer.includes(section), `missing section ${section}`);
    }
    assert.match(data.analysis.answer, /read-only static inspection/);

    const hashesAfter = helpers.sha256(ALLOWED_FILES);
    assert.deepEqual([...hashesAfter.entries()], [...hashesBefore.entries()]);

    const history = await anon.request('/api/agent/audit/history');
    assert.equal(history.status, 200);
    assert.ok(history.json.history.length >= 1);
    assert.equal(history.json.history[0].filesAnalyzed, data.filesAnalyzed);
    assert.ok(history.json.history[0].report.includes('## Summary'));
  });

  it('retourne des erreurs JSON pour les routes inconnues', async () => {
    const response = await anon.request('/route-inconnue');
    assert.equal(response.status, 404);
    assert.equal(typeof response.json.error, 'string');
  });
});
