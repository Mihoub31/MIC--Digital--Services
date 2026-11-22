const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const helpers = require('./helpers');
const { ALLOWED_FILES } = require('../server/project-scope');

describe('Agent pi — lecture seule', () => {
  let server;
  let client;
  let anon;
  let dataDir;

  before(async () => {
    dataDir = helpers.makeTempDataDir();
    helpers.createAdmin(dataDir);
    const port = await helpers.getFreePort();

    server = await helpers.startServer({
      dataDir,
      port,
      env: {
        AGENT_ENABLED: 'true',
        PI_BIN: path.join(helpers.ROOT, 'tests', 'fixtures', 'fake-pi.js'),
        PI_TIMEOUT_MS: '5000',
        PI_MAX_CONTEXT_CHARS: '20000'
      }
    });

    anon = helpers.createClient(server.baseUrl);
    client = helpers.createClient(server.baseUrl);

    const login = await client.request('/api/auth/login', {
      method: 'POST',
      body: { username: helpers.ADMIN_USER, password: helpers.ADMIN_PASSWORD }
    });
    assert.equal(login.status, 200);
  });

  after(async () => {
    if (server) await server.stop();
    if (dataDir) helpers.removeDir(dataDir);
  });

  async function waitFor(id, statuses, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const response = await client.request(`/api/agent/runs/${id}`);
      assert.equal(response.status, 200);

      if (statuses.includes(response.json.run.status)) {
        return response.json.run;
      }

      await new Promise(resolve => setTimeout(resolve, 250));
    }

    throw new Error(`Timed out waiting for run ${id}`);
  }

  it('refuse les routes sans session', async () => {
    assert.equal((await anon.request('/api/agent/runs')).status, 401);
    assert.equal((await anon.request('/api/agent/runs', {
      method: 'POST',
      body: { prompt: 'test' }
    })).status, 401);
    assert.equal((await anon.request('/api/agent/runs/1')).status, 401);
    assert.equal((await anon.request('/admin/agent.js')).status, 302);
  });

  it('exécute une analyse et ne modifie aucun fichier suivi', { timeout: 30000 }, async () => {
    const hashesBefore = helpers.sha256(ALLOWED_FILES);

    const created = await client.request('/api/agent/runs', {
      method: 'POST',
      body: { prompt: 'Summarize the project.' }
    });
    assert.equal(created.status, 202);
    assert.equal(created.json.run.status, 'running');

    const run = await waitFor(created.json.run.id, ['succeeded', 'failed', 'timeout']);
    assert.equal(run.status, 'succeeded');
    assert.match(run.model, /^pi\/qwen2\.5-coder:1\.5b/);
    assert.match(run.output, /Stub analysis: \d+ allowlisted files reviewed\./);
    assert.ok(run.durationMs >= 0);

    const list = await client.request('/api/agent/runs');
    assert.equal(list.status, 200);
    assert.ok(list.json.runs.some(item => item.id === run.id));

    const detail = await client.request(`/api/agent/runs/${run.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.json.run.output, run.output);

    const script = await client.request('/admin/agent.js');
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);

    const hashesAfter = helpers.sha256(ALLOWED_FILES);
    assert.deepEqual([...hashesAfter.entries()], [...hashesBefore.entries()]);
  });

  it('marque un échec de pi', { timeout: 30000 }, async () => {
    const created = await client.request('/api/agent/runs', {
      method: 'POST',
      body: { prompt: 'FAIL_TEST' }
    });
    assert.equal(created.status, 202);

    const run = await waitFor(created.json.run.id, ['failed', 'timeout']);
    assert.equal(run.status, 'failed');
    assert.match(run.error, /fake failure|exited with code 1/);
  });

  it('marque un dépassement de délai', { timeout: 30000 }, async () => {
    const created = await client.request('/api/agent/runs', {
      method: 'POST',
      body: { prompt: 'TIMEOUT_TEST' }
    });
    assert.equal(created.status, 202);

    const run = await waitFor(created.json.run.id, ['timeout', 'failed']);
    assert.equal(run.status, 'timeout');
    assert.match(run.error, /exceeded 5000 ms/);
  });

  it('masque les secrets dans la sortie', { timeout: 30000 }, async () => {
    const created = await client.request('/api/agent/runs', {
      method: 'POST',
      body: { prompt: 'LEAK_TEST' }
    });
    assert.equal(created.status, 202);

    const run = await waitFor(created.json.run.id, ['succeeded', 'failed']);
    assert.equal(run.status, 'succeeded');
    assert.match(run.output, /REDACTED/);
    assert.doesNotMatch(run.output, /super-secret-value|abc123/);
  });

  it('refuse un second run simultané', { timeout: 30000 }, async () => {
    const first = await client.request('/api/agent/runs', {
      method: 'POST',
      body: { prompt: 'SLOW_TEST' }
    });
    assert.equal(first.status, 202);

    const second = await client.request('/api/agent/runs', {
      method: 'POST',
      body: { prompt: 'Summarize the project.' }
    });
    assert.equal(second.status, 409);

    const run = await waitFor(first.json.run.id, ['succeeded', 'failed', 'timeout']);
    assert.equal(run.status, 'succeeded');
  });

  it('valide le prompt et les identifiants', async () => {
    const empty = await client.request('/api/agent/runs', {
      method: 'POST',
      body: { prompt: '' }
    });
    assert.equal(empty.status, 400);

    const tooLong = await client.request('/api/agent/runs', {
      method: 'POST',
      body: { prompt: 'x'.repeat(4001) }
    });
    assert.equal(tooLong.status, 400);

    assert.equal((await client.request('/api/agent/runs/abc')).status, 400);
    assert.equal((await client.request('/api/agent/runs/999999')).status, 404);
  });

  it('reste désactivé par défaut', async () => {
    const disabledDir = helpers.makeTempDataDir();
    helpers.createAdmin(disabledDir);
    const port = await helpers.getFreePort();
    const disabled = await helpers.startServer({
      dataDir: disabledDir,
      port,
      env: { AGENT_ENABLED: 'false' }
    });

    try {
      const disabledClient = helpers.createClient(disabled.baseUrl);
      const login = await disabledClient.request('/api/auth/login', {
        method: 'POST',
        body: { username: helpers.ADMIN_USER, password: helpers.ADMIN_PASSWORD }
      });
      assert.equal(login.status, 200);

      const response = await disabledClient.request('/api/agent/runs');
      assert.equal(response.status, 404);
    } finally {
      await disabled.stop();
      helpers.removeDir(disabledDir);
    }
  });

  it('exécute un vrai run Ollama', { timeout: 360000, skip: process.env.MIC_REAL_PI !== '1' }, async () => {
    const realDir = helpers.makeTempDataDir();
    helpers.createAdmin(realDir);
    const port = await helpers.getFreePort();
    const real = await helpers.startServer({
      dataDir: realDir,
      port,
      env: {
        AGENT_ENABLED: 'true',
        PI_TIMEOUT_MS: '300000',
        PI_MAX_CONTEXT_CHARS: '12000'
      }
    });

    try {
      const realClient = helpers.createClient(real.baseUrl);
      const login = await realClient.request('/api/auth/login', {
        method: 'POST',
        body: { username: helpers.ADMIN_USER, password: helpers.ADMIN_PASSWORD }
      });
      assert.equal(login.status, 200);

      const created = await realClient.request('/api/agent/runs', {
        method: 'POST',
        body: { prompt: 'List two concrete risks in the provided code and cite file paths.' }
      });
      assert.equal(created.status, 202);

      const deadline = Date.now() + 320000;
      let run = created.json.run;

      while (Date.now() < deadline && run.status === 'running') {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const response = await realClient.request(`/api/agent/runs/${created.json.run.id}`);
        assert.equal(response.status, 200);
        run = response.json.run;
      }

      assert.equal(run.status, 'succeeded', run.error);
      assert.ok(run.output.length > 20);
    } finally {
      await real.stop();
      helpers.removeDir(realDir);
    }
  });
});
