import { config } from '../config/index.js';
import { ApiError } from '../utils/errors.js';
import { jaccard, shingles } from '../utils/similarity.js';

const MAX_TEXT_LENGTH = 2000;
const SNIPPET_LENGTH = 180;
const LEXICAL_THRESHOLD = 0.82;

export class SemanticProviderError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'SemanticProviderError';
    this.status = status;
  }
}

const round = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const collapse = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const snippet = (value) => {
  const text = collapse(value);
  return text.length > SNIPPET_LENGTH
    ? `${text.slice(0, SNIPPET_LENGTH - 1)}…`
    : text;
};

function cosineWithNorms(a, b, normA, normB) {
  if (normA === 0 || normB === 0) return 0;
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) dot += a[index] * b[index];
  return dot / (normA * normB);
}

function normOf(vector) {
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.sqrt(sum);
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0) return 0;
  if (a.length !== b.length) return 0;
  return cosineWithNorms(a, b, normOf(a), normOf(b));
}

class UnionFind {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(id) {
    let root = id;
    while (this.parent[root] !== root) root = this.parent[root];
    let current = id;
    while (this.parent[current] !== root) {
      const next = this.parent[current];
      this.parent[current] = root;
      current = next;
    }
    return root;
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent[rootB] = rootA;
  }
}

/**
 * Backend-only OpenAI embeddings.
 *
 * The key is read from the server environment and is never returned to a
 * client. Requests are batched and use a timeout; failures carry a safe
 * message that never includes the key, prompt text or provider response body.
 */
export function createOpenAiEmbedder({
  apiKey,
  model = 'text-embedding-3-small',
  baseUrl = 'https://api.openai.com/v1',
  batchSize = 64,
  timeoutMs = 20000,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) return null;
  if (typeof fetchImpl !== 'function') {
    throw new SemanticProviderError('No fetch implementation is available for embeddings.');
  }
  const endpoint = `${String(baseUrl).replace(/\/+$/, '')}/embeddings`;

  async function embedBatch(input) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input, encoding_format: 'float' }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw new SemanticProviderError('The embedding provider timed out.');
      }
      throw new SemanticProviderError('The embedding provider could not be reached.');
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new SemanticProviderError(
        'The embedding provider rejected the request.',
        response.status,
      );
    }

    const data = payload?.data;
    if (!Array.isArray(data) || data.length !== input.length) {
      throw new SemanticProviderError(
        'The embedding provider returned an unexpected payload.',
      );
    }

    const ordered = [...data].sort(
      (a, b) => (a?.index ?? 0) - (b?.index ?? 0),
    );
    const vectors = ordered.map((item) => {
      const vector = item?.embedding;
      if (
        !Array.isArray(vector) ||
        vector.length === 0 ||
        !vector.every((value) => Number.isFinite(value))
      ) {
        throw new SemanticProviderError(
          'The embedding provider returned an invalid vector.',
        );
      }
      return vector;
    });

    if (vectors.some((vector) => vector.length !== vectors[0].length)) {
      throw new SemanticProviderError(
        'The embedding provider returned vectors with inconsistent sizes.',
      );
    }

    return vectors;
  }

  return Object.freeze({
    name: 'openai',
    model,
    async embed(texts) {
      const vectors = [];
      let batches = 0;
      for (let offset = 0; offset < texts.length; offset += batchSize) {
        const batch = texts.slice(offset, offset + batchSize);
        vectors.push(...(await embedBatch(batch)));
        batches += 1;
      }
      return {
        vectors,
        batches,
        dimensions: vectors[0]?.length ?? 0,
      };
    },
  });
}

function disabledPayload({ model, threshold, reason }) {
  return {
    enabled: false,
    status: 'disabled',
    reason,
    model,
    threshold,
    lexicalThreshold: LEXICAL_THRESHOLD,
    provider: null,
    generatedAt: new Date().toISOString(),
    totals: null,
    clusters: [],
    notes: [
      'Semantic clustering is optional and does not change campaign detection, thresholds or metrics.',
      'PR text is sent only from this backend to the embedding provider. The API key is never exposed to the browser or written to the repository.',
    ],
  };
}

/**
 * Groups PRs by embedding similarity across project boundaries.
 *
 * Only cross-project pairs can be linked, so a cluster always spans at least
 * two projects. Lexical overlap is measured for the same pairs so the response
 * can show where meaning-based matching differs from exact wording.
 */
export async function buildSemanticClusters({
  state,
  embedder,
  options = {},
}) {
  const threshold = options.threshold ?? config.semanticSimilarityThreshold;
  const minProjects = options.minProjects ?? config.semanticMinProjects;
  const minMembers = options.minMembers ?? config.semanticMinMembers;
  const maxClusters = options.maxClusters ?? config.semanticMaxClusters;
  const maxTextLength = options.maxTextLength ?? MAX_TEXT_LENGTH;
  const maxRepresentatives = options.maxRepresentatives ?? 3;
  const model = embedder?.model ?? config.openaiEmbeddingModel;

  if (!embedder) {
    return disabledPayload({
      model,
      threshold,
      reason:
        'Semantic clustering is disabled because OPENAI_API_KEY is not set in the backend environment.',
    });
  }

  const pullRequests = [...(state.pullRequests ?? [])]
    .filter((pr) => collapse(pr.contentSample).length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (pullRequests.length === 0) {
    return {
      enabled: true,
      status: 'ok',
      model,
      threshold,
      lexicalThreshold: LEXICAL_THRESHOLD,
      provider: { name: embedder.name ?? 'openai', model, batches: 0 },
      generatedAt: new Date().toISOString(),
      totals: {
        pullRequests: 0,
        embeddedPullRequests: 0,
        uniqueTexts: 0,
        dimensions: 0,
        crossProjectPairs: 0,
        semanticPairs: 0,
        lexicalPairs: 0,
        bothPairs: 0,
        semanticOnlyPairs: 0,
        lexicalOnlyPairs: 0,
        exactDuplicatePairs: 0,
        clusters: 0,
        returnedClusters: 0,
        omittedClusters: 0,
      },
      clusters: [],
      notes: ['This simulation has no pull request text to embed.'],
    };
  }

  const uniqueTexts = [];
  const uniqueIndex = new Map();
  const textIndexByPr = pullRequests.map((pr) => {
    const text = collapse(pr.contentSample).slice(0, maxTextLength);
    if (!uniqueIndex.has(text)) {
      uniqueIndex.set(text, uniqueTexts.length);
      uniqueTexts.push(text);
    }
    return uniqueIndex.get(text);
  });

  const embedded = await embedder.embed(uniqueTexts);
  const vectors = embedded.vectors;
  if (vectors.length !== uniqueTexts.length) {
    throw new SemanticProviderError(
      'The embedding provider returned the wrong number of vectors.',
    );
  }

  const norms = vectors.map(normOf);
  const shingleCache = uniqueTexts.map((text) => shingles(text));

  const union = new UnionFind(pullRequests.length);
  const edges = [];
  let crossProjectPairs = 0;
  let semanticPairs = 0;
  let lexicalPairs = 0;
  let bothPairs = 0;
  let semanticOnlyPairs = 0;
  let lexicalOnlyPairs = 0;
  let exactDuplicatePairs = 0;

  for (let i = 0; i < pullRequests.length; i += 1) {
    const left = pullRequests[i];
    for (let j = i + 1; j < pullRequests.length; j += 1) {
      const right = pullRequests[j];
      if (left.projectId === right.projectId) continue;
      crossProjectPairs += 1;

      const leftVector = vectors[textIndexByPr[i]];
      const rightVector = vectors[textIndexByPr[j]];
      const similarity = cosineWithNorms(
        leftVector,
        rightVector,
        norms[textIndexByPr[i]],
        norms[textIndexByPr[j]],
      );
      const lexical = jaccard(
        shingleCache[textIndexByPr[i]],
        shingleCache[textIndexByPr[j]],
      );
      const semanticHit = similarity >= threshold;
      const lexicalHit = lexical >= LEXICAL_THRESHOLD;
      const exact =
        left.contentFingerprint === right.contentFingerprint;

      if (exact) exactDuplicatePairs += 1;
      if (semanticHit) {
        semanticPairs += 1;
        union.union(i, j);
        edges.push({ i, j, similarity, lexical, exact });
        if (lexicalHit) bothPairs += 1;
        else semanticOnlyPairs += 1;
      } else if (lexicalHit) {
        lexicalOnlyPairs += 1;
      }
      if (lexicalHit) lexicalPairs += 1;
    }
  }

  const statsByRoot = new Map();
  for (const edge of edges) {
    const root = union.find(edge.i);
    let stats = statsByRoot.get(root);
    if (!stats) {
      stats = {
        pairCount: 0,
        sumSimilarity: 0,
        minSimilarity: 1,
        maxSimilarity: 0,
        sumLexical: 0,
        minLexical: 1,
        maxLexical: 0,
        semanticOnlyPairs: 0,
        exactDuplicatePairs: 0,
      };
      statsByRoot.set(root, stats);
    }
    stats.pairCount += 1;
    stats.sumSimilarity += edge.similarity;
    stats.minSimilarity = Math.min(stats.minSimilarity, edge.similarity);
    stats.maxSimilarity = Math.max(stats.maxSimilarity, edge.similarity);
    stats.sumLexical += edge.lexical;
    stats.minLexical = Math.min(stats.minLexical, edge.lexical);
    stats.maxLexical = Math.max(stats.maxLexical, edge.lexical);
    if (edge.lexical < LEXICAL_THRESHOLD) stats.semanticOnlyPairs += 1;
    if (edge.exact) stats.exactDuplicatePairs += 1;
  }

  const campaignIdsByContributor = new Map();
  for (const campaign of state.campaignData?.campaigns ?? []) {
    for (const contributorId of campaign.memberContributorIds ?? []) {
      if (!campaignIdsByContributor.has(contributorId)) {
        campaignIdsByContributor.set(contributorId, new Set());
      }
      campaignIdsByContributor.get(contributorId).add(campaign.id);
    }
  }

  const groups = new Map();
  for (let index = 0; index < pullRequests.length; index += 1) {
    const root = union.find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index);
  }

  const candidates = [];
  for (const [root, memberIndexes] of groups) {
    if (memberIndexes.length < minMembers) continue;
    const stats = statsByRoot.get(root);
    if (!stats) continue;

    const members = memberIndexes.map((index) => pullRequests[index]);
    const projectIds = [...new Set(members.map((pr) => pr.projectId))].sort();
    if (projectIds.length < minProjects) continue;
    const contributorIds = [...new Set(members.map((pr) => pr.contributorId))].sort();
    const campaignIds = new Set();
    let campaignMembers = 0;
    for (const contributorId of contributorIds) {
      const campaigns = campaignIdsByContributor.get(contributorId);
      if (!campaigns) continue;
      campaignMembers += 1;
      for (const campaignId of campaigns) campaignIds.add(campaignId);
    }

    const meanSimilarity = stats.sumSimilarity / stats.pairCount;
    const meanLexicalSimilarity = stats.sumLexical / stats.pairCount;
    const firstPrId = members[0].id;
    candidates.push({
      root,
      members,
      projectIds,
      contributorIds,
      campaignIds: [...campaignIds].sort(),
      campaignMembers,
      stats,
      firstPrId,
      meanSimilarity,
      meanLexicalSimilarity,
    });
  }

  candidates.sort(
    (a, b) =>
      (b.campaignIds.length > 0) - (a.campaignIds.length > 0) ||
      b.meanSimilarity - a.meanSimilarity ||
      b.members.length - a.members.length ||
      a.firstPrId.localeCompare(b.firstPrId),
  );

  const selected = candidates.slice(0, maxClusters);
  const clusters = selected.map((candidate, clusterIndex) => {
    const sortedMembers = [...candidate.members].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const representatives = [];
    const seenProjects = new Set();
    for (const pr of sortedMembers) {
      if (representatives.length >= maxRepresentatives) break;
      if (seenProjects.has(pr.projectId)) continue;
      seenProjects.add(pr.projectId);
      representatives.push({
        prId: pr.id,
        projectId: pr.projectId,
        projectName: state.projects?.get(pr.projectId)?.name ?? pr.projectId,
        contributorId: pr.contributorId,
        contributorHandle:
          state.contributors?.get(pr.contributorId)?.handle ?? pr.contributorId,
        snippet: snippet(pr.contentSample),
      });
    }

    const pathCounts = new Map();
    for (const pr of sortedMembers) {
      const value = collapse(pr.changedPathsSummary);
      if (!value) continue;
      pathCounts.set(value, (pathCounts.get(value) ?? 0) + 1);
    }
    const commonPaths = [...pathCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 2)
      .map(([value, count]) => ({ value, count }));

    const stats = candidate.stats;
    return {
      id: `semantic_${String(clusterIndex + 1).padStart(2, '0')}`,
      members: sortedMembers.length,
      projectCount: candidate.projectIds.length,
      contributorCount: candidate.contributorIds.length,
      pairCount: stats.pairCount,
      meanSimilarity: round(candidate.meanSimilarity),
      minSimilarity: round(stats.minSimilarity),
      maxSimilarity: round(stats.maxSimilarity),
      meanLexicalSimilarity: round(candidate.meanLexicalSimilarity),
      minLexicalSimilarity: round(stats.minLexical),
      maxLexicalSimilarity: round(stats.maxLexical),
      semanticOnlyPairs: stats.semanticOnlyPairs,
      exactDuplicatePairs: stats.exactDuplicatePairs,
      campaignIds: candidate.campaignIds,
      campaignMembers: candidate.campaignMembers,
      projects: candidate.projectIds.map((id) => ({
        id,
        name: state.projects?.get(id)?.name ?? id,
      })),
      representatives,
      commonPaths,
      firstPrId: candidate.firstPrId,
    };
  });

  return {
    enabled: true,
    status: 'ok',
    model,
    threshold,
    lexicalThreshold: LEXICAL_THRESHOLD,
    provider: {
      name: embedder.name ?? 'openai',
      model,
      batches: embedded.batches ?? null,
    },
    generatedAt: new Date().toISOString(),
    totals: {
      pullRequests: pullRequests.length,
      embeddedPullRequests: pullRequests.length,
      uniqueTexts: uniqueTexts.length,
      dimensions: embedded.dimensions ?? vectors[0]?.length ?? 0,
      crossProjectPairs,
      semanticPairs,
      lexicalPairs,
      bothPairs,
      semanticOnlyPairs,
      lexicalOnlyPairs,
      exactDuplicatePairs,
      clusters: candidates.length,
      returnedClusters: clusters.length,
      omittedClusters: Math.max(0, candidates.length - clusters.length),
    },
    clusters,
    notes: [
      `Pairs are compared only when the two PRs target different projects. A cluster needs at least ${minProjects} projects and ${minMembers} PRs.`,
      `Semantic pairs use cosine similarity ≥ ${threshold} on ${model} embeddings. Lexical pairs reuse the 0.82 shingle overlap used by campaign detection for comparison only.`,
      'Content similarity is investigative evidence. It does not prove authorship, intent, coordination or AI generation.',
      'Ordinary PRs that share a project template can cluster too; campaign overlap is reported separately so a cluster is not treated as a campaign on its own.',
    ],
  };
}

export function createSemanticClusterService({
  embedder,
  options = {},
} = {}) {
  const resolvedEmbedder =
    embedder === undefined
      ? createOpenAiEmbedder({
          apiKey: config.openaiApiKey,
          model: config.openaiEmbeddingModel,
          baseUrl: config.openaiBaseUrl,
          batchSize: config.semanticBatchSize,
          timeoutMs: config.semanticTimeoutMs,
        })
      : embedder;

  return Object.freeze({
    enabled: Boolean(resolvedEmbedder),
    model: resolvedEmbedder?.model ?? config.openaiEmbeddingModel,
    async compute(state) {
      try {
        return await buildSemanticClusters({
          state,
          embedder: resolvedEmbedder,
          options,
        });
      } catch (error) {
        if (error instanceof SemanticProviderError) {
          throw new ApiError(
            503,
            'SEMANTIC_PROVIDER_UNAVAILABLE',
            'Semantic clustering is configured but the embedding provider is unavailable. Campaign detection and metrics are unaffected.',
          );
        }
        throw error;
      }
    },
  });
}
