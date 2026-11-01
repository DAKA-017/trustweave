import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../app.js';
import { simulationHost } from '../services/simulation-host.js';
import {
  createSemanticClusterService,
  SemanticProviderError,
} from '../services/semantic-clusters.js';

const SESSION = 'semantic-api-visitor';
const originalService = simulationHost.semanticService;

function asVisitor(builder) {
  return builder.set('X-TrustWeave-Session', SESSION);
}

function campaignEmbedder() {
  return {
    name: 'stub',
    model: 'stub-embedding',
    calls: 0,
    async embed(texts) {
      this.calls += 1;
      return {
        vectors: texts.map((text) =>
          text.includes('improves performance') ? [1, 1] : [0, 1],
        ),
        batches: 1,
        dimensions: 2,
      };
    },
  };
}

before(async () => {
  await asVisitor(request(app).post('/api/simulate'))
    .send({ seed: 42, size: 30, campaignSize: 12 })
    .expect(200);
});

after(() => {
  simulationHost.setSemanticService(originalService);
});

test('reports an honest disabled state without an embedding key', async () => {
  simulationHost.setSemanticService(
    createSemanticClusterService({ embedder: null }),
  );

  const response = await asVisitor(
    request(app).get('/api/semantic-clusters'),
  ).expect(200);

  assert.equal(response.body.enabled, false);
  assert.equal(response.body.status, 'disabled');
  assert.ok(response.body.reason.includes('OPENAI_API_KEY'));
  assert.deepEqual(response.body.clusters, []);
  assert.equal(response.body.totals, null);

  const campaigns = await asVisitor(request(app).get('/api/campaigns')).expect(200);
  assert.equal(campaigns.body.campaigns.length, 1);
  assert.ok(campaigns.body.detector.config.similarityThreshold > 0);
});

test('clusters cross-project campaign PRs and caches one embedding run', async () => {
  const embedder = campaignEmbedder();
  simulationHost.setSemanticService(
    createSemanticClusterService({
      embedder,
      options: { threshold: 0.86, minProjects: 3, minMembers: 3, maxClusters: 8 },
    }),
  );

  const first = await asVisitor(
    request(app).get('/api/semantic-clusters'),
  ).expect(200);

  assert.equal(first.body.enabled, true);
  assert.equal(first.body.status, 'ok');
  assert.equal(first.body.model, 'stub-embedding');
  assert.equal(first.body.provider.name, 'stub');
  assert.equal(first.body.totals.pullRequests, 417);
  assert.equal(first.body.totals.embeddedPullRequests, 417);
  assert.ok(first.body.totals.uniqueTexts < 417);
  assert.ok(first.body.totals.semanticPairs > 0);
  assert.ok(first.body.totals.exactDuplicatePairs > 0);
  assert.ok(first.body.clusters.length >= 1);

  const campaignCluster = first.body.clusters[0];
  assert.ok(campaignCluster.campaignIds.includes('campaign_01'));
  assert.equal(campaignCluster.campaignMembers, 12);
  assert.ok(campaignCluster.projectCount >= 3);
  assert.equal(campaignCluster.members, 288);
  assert.ok(campaignCluster.representatives.length > 0);
  assert.ok(
    campaignCluster.projects.every((project) => project.name.length > 0),
  );

  const serialized = JSON.stringify(first.body);
  assert.equal(serialized.includes('sk-'), false);
  assert.equal(serialized.includes('authorization'), false);

  await asVisitor(request(app).get('/api/semantic-clusters')).expect(200);
  assert.equal(embedder.calls, 1);
});

test('maps provider failures to a retryable 503 without leaking details', async () => {
  const failing = {
    name: 'stub',
    model: 'stub-embedding',
    async embed() {
      throw new SemanticProviderError(
        'Incorrect API key provided: sk-test-key-only',
        401,
      );
    },
  };
  simulationHost.setSemanticService(
    createSemanticClusterService({ embedder: failing }),
  );

  const response = await asVisitor(
    request(app).get('/api/semantic-clusters'),
  ).expect(503);
  assert.equal(response.body.error.code, 'SEMANTIC_PROVIDER_UNAVAILABLE');
  assert.equal(JSON.stringify(response.body).includes('sk-'), false);

  simulationHost.setSemanticService(
    createSemanticClusterService({
      embedder: campaignEmbedder(),
      options: { threshold: 0.86, minProjects: 3, minMembers: 3 },
    }),
  );
  const retry = await asVisitor(
    request(app).get('/api/semantic-clusters'),
  ).expect(200);
  assert.equal(retry.body.enabled, true);
});
