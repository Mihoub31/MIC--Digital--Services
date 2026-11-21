const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('./helpers');

describe('Limitation de débit — connexion', () => {
  let server;
  let client;
  let dataDir;

  before(async () => {
    dataDir = helpers.makeTempDataDir();
    helpers.createAdmin(dataDir);
    const port = await helpers.getFreePort();
    server = await helpers.startServer({ dataDir, port });
    client = helpers.createClient(server.baseUrl);
  });

  after(async () => {
    if (server) await server.stop();
    if (dataDir) helpers.removeDir(dataDir);
  });

  it('bloque la connexion après 10 tentatives', { timeout: 60000 }, async () => {
    const statuses = [];

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await client.request('/api/auth/login', {
        method: 'POST',
        body: { username: 'nobody', password: 'wrong-password' }
      });
      statuses.push(response.status);
    }

    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
    assert.equal(statuses[10], 429);

    const blocked = await client.request('/api/auth/login', {
      method: 'POST',
      body: { username: helpers.ADMIN_USER, password: helpers.ADMIN_PASSWORD }
    });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get('retry-after'));
    assert.match(blocked.json.error, /محاولات كثيرة/);
  });

  it('laisse les autres routes API accessibles', async () => {
    const status = await client.request('/api/status');
    assert.equal(status.status, 200);
    assert.equal(status.json.status, 'online');
  });
});
