import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSemanticClusters,
  cosineSimilarity,
  createOpenAiEmbedder,
  SemanticProviderError,
} from '../services/semantic-clusters.js';

function makePr(id, projectId, contributorId, text, paths = 'src/a.js') {
  return {
    id,
    projectId,
    contributorId,
    contentSample: text,
    contentFingerprint: `fp_${text}`,
    changedPathsSummary: paths,
  };
}

function makeState(pullRequests, campaigns = []) {
  const projects = new Map();
  const contributors = new Map();
  for (const pr of pullRequests) {
    if (!projects.has(pr.projectId)) {
      projects.set(pr.projectId, { id: pr.projectId, name: `Project ${pr.projectId}` });
    }
    if (!contributors.has(pr.contributorId)) {
      contributors.set(pr.contributorId, {
        id: pr.contributorId,
        handle: `user-${pr.contributorId}`,
        accountCreatedAt: '2025-01-01T00:00:00.000Z',
      });
    }
  }
  return {
    projects,
    contributors,
    pullRequests,
    campaignData: { campaigns },
  };
}

function stubEmbedder(vectorsByText) {
  return {
    name: 'stub',
    model: 'stub-embedding',
    calls: 0,
    async embed(texts) {
      this.calls += 1;
      return {
        vectors: texts.map((text) => vectorsByText[text] ?? [0, 0, 1]),
        batches: 1,
        dimensions: 3,
      };
    },
  };
}

test('cosine similarity is symmetric and rejects mismatched vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), 0);
  assert.equal(cosineSimilarity([1, 0], [1, 0, 0]), 0);
});

test('clusters cross-project PRs with the same meaning and reports campaign overlap', async () => {
  const pullRequests = [
    makePr('pr_0001', 'p01', 'c01', 'retry timeout'),
    makePr('pr_0002', 'p02', 'c02', 'retry timeout'),
    makePr('pr_0003', 'p03', 'c03', 'retry timeout'),
    makePr('pr_0004', 'p01', 'c04', 'docs wording'),
    makePr('pr_0005', 'p01', 'c05', 'docs wording'),
    makePr('pr_0006', 'p02', 'c06', 'fully different'),
  ];
  const state = makeState(pullRequests, [
    { id: 'campaign_01', memberContributorIds: ['c03'] },
  ]);
  const embedder = stubEmbedder({
    'retry timeout': [1, 0, 0],
    'docs wording': [0, 1, 0],
    'fully different': [0, 0, 1],
  });

  const result = await buildSemanticClusters({
    state,
    embedder,
    options: {
      threshold: 0.95,
      minProjects: 3,
      minMembers: 3,
      maxClusters: 5,
    },
  });

  assert.equal(result.enabled, true);
  assert.equal(result.status, 'ok');
  assert.equal(result.model, 'stub-embedding');
  assert.equal(result.clusters.length, 1);
  const cluster = result.clusters[0];
  assert.equal(cluster.id, 'semantic_01');
  assert.equal(cluster.members, 3);
  assert.equal(cluster.projectCount, 3);
  assert.equal(cluster.contributorCount, 3);
  assert.equal(cluster.pairCount, 3);
  assert.equal(cluster.meanSimilarity, 1);
  assert.equal(cluster.meanLexicalSimilarity, 1);
  assert.equal(cluster.exactDuplicatePairs, 3);
  assert.deepEqual(cluster.campaignIds, ['campaign_01']);
  assert.equal(cluster.campaignMembers, 1);
  assert.equal(cluster.projects.length, 3);
  assert.equal(cluster.representatives.length, 3);
  assert.ok(cluster.representatives.every((item) => item.snippet.length > 0));
  assert.ok(cluster.representatives.every((item) => item.projectName.startsWith('Project ')));

  assert.equal(result.totals.pullRequests, 6);
  assert.equal(result.totals.uniqueTexts, 3);
  assert.equal(result.totals.semanticPairs, 3);
  assert.equal(result.totals.lexicalPairs, 3);
  assert.equal(result.totals.bothPairs, 3);
  assert.equal(result.totals.semanticOnlyPairs, 0);
  assert.equal(result.totals.clusters, 1);
  assert.ok(result.notes.some((note) => note.includes('does not prove authorship')));
});

test('requires the configured number of projects', async () => {
  const pullRequests = [
    makePr('pr_0001', 'p01', 'c01', 'same meaning'),
    makePr('pr_0002', 'p02', 'c02', 'same meaning'),
  ];
  const state = makeState(pullRequests);
  const embedder = stubEmbedder({ 'same meaning': [1, 0, 0] });

  const strict = await buildSemanticClusters({
    state,
    embedder,
    options: { threshold: 0.95, minProjects: 3, minMembers: 2 },
  });
  assert.equal(strict.clusters.length, 0);
  assert.equal(strict.totals.semanticPairs, 1);

  const relaxed = await buildSemanticClusters({
    state,
    embedder,
    options: { threshold: 0.95, minProjects: 2, minMembers: 2 },
  });
  assert.equal(relaxed.clusters.length, 1);
  assert.equal(relaxed.clusters[0].projectCount, 2);
});

test('separates meaning-only matches from exact wording', async () => {
  const pullRequests = [
    makePr('pr_0001', 'p01', 'c01', 'alpha beta gamma delta'),
    makePr('pr_0002', 'p02', 'c02', 'epsilon zeta eta theta'),
  ];
  const state = makeState(pullRequests);
  const embedder = stubEmbedder({
    'alpha beta gamma delta': [1, 0, 0],
    'epsilon zeta eta theta': [1, 0, 0],
  });

  const result = await buildSemanticClusters({
    state,
    embedder,
    options: { threshold: 0.95, minProjects: 2, minMembers: 2 },
  });

  assert.equal(result.clusters.length, 1);
  assert.equal(result.clusters[0].meanSimilarity, 1);
  assert.equal(result.clusters[0].meanLexicalSimilarity, 0);
  assert.equal(result.totals.semanticOnlyPairs, 1);
  assert.equal(result.totals.bothPairs, 0);
  assert.equal(result.totals.lexicalOnlyPairs, 0);
});

test('returns an explicit disabled payload without an embedder', async () => {
  const state = makeState([makePr('pr_0001', 'p01', 'c01', 'text')]);
  const result = await buildSemanticClusters({ state, embedder: null });
  assert.equal(result.enabled, false);
  assert.equal(result.status, 'disabled');
  assert.ok(result.reason.includes('OPENAI_API_KEY'));
  assert.deepEqual(result.clusters, []);
  assert.equal(result.totals, null);
});

test('batches OpenAI embedding requests and restores response order', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    const data = body.input.map((text, index) => ({
      index,
      embedding: [Number(text.slice(-1)), 1],
    }));
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: data.reverse() }),
    };
  };

  const embedder = createOpenAiEmbedder({
    apiKey: 'sk-test-key-only',
    model: 'test-embedding',
    baseUrl: 'https://provider.example/v1/',
    batchSize: 2,
    fetchImpl,
  });
  const result = await embedder.embed(['text-1', 'text-2', 'text-3']);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://provider.example/v1/embeddings');
  assert.equal(calls[0].headers.authorization, 'Bearer sk-test-key-only');
  assert.equal(calls[0].body.model, 'test-embedding');
  assert.deepEqual(calls[0].body.input, ['text-1', 'text-2']);
  assert.deepEqual(calls[1].body.input, ['text-3']);
  assert.deepEqual(result.vectors, [
    [1, 1],
    [2, 1],
    [3, 1],
  ]);
  assert.equal(result.batches, 2);
  assert.equal(result.dimensions, 2);
});

test('provider failures surface safe messages without the key', async () => {
  const rejecting = createOpenAiEmbedder({
    apiKey: 'sk-test-key-only',
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        error: { message: 'Incorrect API key provided: sk-test-key-only' },
      }),
    }),
  });
  await assert.rejects(
    () => rejecting.embed(['text']),
    (error) => {
      assert.ok(error instanceof SemanticProviderError);
      assert.equal(error.status, 401);
      assert.equal(error.message.includes('sk-test-key-only'), false);
      assert.equal(error.message.includes('Incorrect'), false);
      return true;
    },
  );

  const malformed = createOpenAiEmbedder({
    apiKey: 'sk-test-key-only',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    }),
  });
  await assert.rejects(
    () => malformed.embed(['text']),
    /unexpected payload/,
  );

  const timingOut = createOpenAiEmbedder({
    apiKey: 'sk-test-key-only',
    fetchImpl: async () => {
      const error = new Error('aborted');
      error.name = 'TimeoutError';
      throw error;
    },
  });
  await assert.rejects(() => timingOut.embed(['text']), /timed out/);
});
