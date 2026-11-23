const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const helpers = require('./helpers');
const { ALLOWED_FILES } = require('../server/project-scope');

const FIXTURES = path.join(helpers.ROOT, 'tests', 'fixtures');

function removeArtifacts(dataDir) {
  fs.rmSync(
    path.join(helpers.ROOT, 'artifacts', 'graphify', path.basename(dataDir)),
    { recursive: true, force: true }
  );
}

async function startGraphServer(bin, extraEnv = {}) {
  const dataDir = helpers.makeTempDataDir();
  helpers.createAdmin(dataDir);
  const port = await helpers.getFreePort();

  const server = await helpers.startServer({
    dataDir,
    port,
    env: {
      GRAPHIFY_BIN: bin,
      GRAPHIFY_TIMEOUT_MS: '60000',
      ...extraEnv
    }
  });

  const anon = helpers.createClient(server.baseUrl);
  const client = helpers.createClient(server.baseUrl);
  const login = await client.request('/api/auth/login', {
    method: 'POST',
    body: { username: helpers.ADMIN_USER, password: helpers.ADMIN_PASSWORD }
  });
  assert.equal(login.status, 200);

  return {
    server,
    client,
    anon,
    dataDir,
    async stop() {
      await server.stop();
      helpers.removeDir(dataDir);
      removeArtifacts(dataDir);
    }
  };
}

async function waitForBuild(client, statuses, timeoutMs = 20000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await client.request('/api/agent/graph/latest');

    if (response.status === 200 && statuses.includes(response.json.build.status)) {
      return response.json.build;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timed out waiting for a graph build');
}

describe('graphify — cartographie locale', () => {
  let ctx;

  before(async () => {
    ctx = await startGraphServer(path.join(FIXTURES, 'fake-graphify-ok.js'));
  });

  after(async () => {
    if (ctx) await ctx.stop();
  });

  it('refuse les routes sans session', async () => {
    assert.equal((await ctx.anon.request('/api/agent/graph/latest')).status, 401);
    assert.equal((await ctx.anon.request('/api/agent/graph/view')).status, 401);
    assert.equal((await ctx.anon.request('/api/agent/graph/build', {
      method: 'POST',
      body: {}
    })).status, 401);
    assert.equal((await ctx.anon.request('/admin/graph.js')).status, 302);
  });

  it('construit la carte, sert la visionneuse et ne modifie aucun fichier suivi', { timeout: 30000 }, async () => {
    const hashesBefore = helpers.sha256(ALLOWED_FILES);

    const created = await ctx.client.request('/api/agent/graph/build', {
      method: 'POST',
      body: {}
    });
    assert.equal(created.status, 202);
    assert.equal(created.json.build.status, 'running');

    const build = await waitForBuild(ctx.client, ['succeeded', 'failed', 'rejected', 'timeout']);
    assert.equal(build.status, 'succeeded');
    assert.match(build.report, /fake graph report/);
    assert.match(build.htmlPath, /graph\.html$/);

    const view = await ctx.client.request('/api/agent/graph/view');
    assert.equal(view.status, 200);
    assert.match(view.headers.get('content-type'), /text\/html/);
    assert.match(view.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(view.text, /fake graph viewer/);

    const script = await ctx.client.request('/admin/graph.js');
    assert.equal(script.status, 200);
    assert.match(script.text, /showGraphPanel/);

    const latest = await ctx.client.request('/api/agent/graph/latest');
    assert.equal(latest.json.build.id, build.id);

    const hashesAfter = helpers.sha256(ALLOWED_FILES);
    assert.deepEqual([...hashesAfter.entries()], [...hashesBefore.entries()]);
  });

  it('rejette une visionneuse qui référence des ressources externes', { timeout: 30000 }, async () => {
    const external = await startGraphServer(path.join(FIXTURES, 'fake-graphify-external.js'));

    try {
      const created = await external.client.request('/api/agent/graph/build', {
        method: 'POST',
        body: {}
      });
      assert.equal(created.status, 202);

      const build = await waitForBuild(external.client, ['succeeded', 'failed', 'rejected', 'timeout']);
      assert.equal(build.status, 'rejected');
      assert.equal(build.htmlPath, '');
      assert.match(build.error, /external/);
      assert.match(build.report, /fake graph report/);

      const view = await external.client.request('/api/agent/graph/view');
      assert.equal(view.status, 404);
    } finally {
      await external.stop();
    }
  });

  it('marque un échec quand les sorties manquent', { timeout: 30000 }, async () => {
    const missing = await startGraphServer(path.join(FIXTURES, 'fake-graphify-missing.js'));

    try {
      const created = await missing.client.request('/api/agent/graph/build', {
        method: 'POST',
        body: {}
      });
      assert.equal(created.status, 202);

      const build = await waitForBuild(missing.client, ['succeeded', 'failed', 'rejected', 'timeout']);
      assert.equal(build.status, 'failed');
      assert.match(build.error, /did not produce/);
    } finally {
      await missing.stop();
    }
  });

  it('applique le délai et refuse un second build simultané', { timeout: 30000 }, async () => {
    const slow = await startGraphServer(
      path.join(FIXTURES, 'fake-graphify-timeout.js'),
      { GRAPHIFY_TIMEOUT_MS: '3000' }
    );

    try {
      const first = await slow.client.request('/api/agent/graph/build', {
        method: 'POST',
        body: {}
      });
      assert.equal(first.status, 202);

      const second = await slow.client.request('/api/agent/graph/build', {
        method: 'POST',
        body: {}
      });
      assert.equal(second.status, 409);

      const build = await waitForBuild(slow.client, ['succeeded', 'failed', 'rejected', 'timeout']);
      assert.equal(build.status, 'timeout');
      assert.match(build.error, /exceeded/);
    } finally {
      await slow.stop();
    }
  });

  it('reste indisponible sans binaire graphify', async () => {
    const offline = await startGraphServer(path.join(FIXTURES, 'absent-graphify.exe'));

    try {
      assert.equal((await offline.client.request('/api/agent/graph/latest')).status, 404);
      assert.equal((await offline.client.request('/api/agent/graph/view')).status, 404);
      assert.equal((await offline.client.request('/api/agent/graph/build', {
        method: 'POST',
        body: {}
      })).status, 404);
    } finally {
      await offline.stop();
    }
  });

  const real = process.env.MIC_REAL_GRAPHIFY === '1' ? it : it.skip;

  real('construit une carte réelle sans ressource externe servie', { timeout: 640000 }, async () => {
    const realCtx = await startGraphServer(
      path.join(helpers.ROOT, 'services', 'uv-bin', 'graphify.exe'),
      { GRAPHIFY_TIMEOUT_MS: '600000' }
    );

    try {
      const hashesBefore = helpers.sha256(ALLOWED_FILES);

      const created = await realCtx.client.request('/api/agent/graph/build', {
        method: 'POST',
        body: {}
      });
      assert.equal(created.status, 202);

      const build = await waitForBuild(
        realCtx.client,
        ['succeeded', 'failed', 'rejected', 'timeout'],
        600000,
        5000
      );

      assert.ok(['succeeded', 'rejected'].includes(build.status), build.error);
      assert.match(build.report, /Graph Report/);
      assert.ok(build.durationMs > 1000);

      const view = await realCtx.client.request('/api/agent/graph/view');
      if (build.status === 'rejected') {
        assert.equal(view.status, 404);
      } else {
        assert.equal(view.status, 200);
        assert.doesNotMatch(view.text, /https?:\/\//);
      }

      const hashesAfter = helpers.sha256(ALLOWED_FILES);
      assert.deepEqual([...hashesAfter.entries()], [...hashesBefore.entries()]);
    } finally {
      await realCtx.stop();
    }
  });
});
