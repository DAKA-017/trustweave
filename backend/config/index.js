import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));

if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Environment defaults below still apply.
  }
}

function intFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function floatFromEnv(name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const parsed = Number.parseFloat(process.env[name] ?? '');
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: intFromEnv('PORT', 5000),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  simSeed: intFromEnv('SIM_SEED', 42),
  verifyOnStart: boolFromEnv('VERIFY_ON_START', true),
  verifyIntervalMinutes: Math.max(0, intFromEnv('VERIFY_INTERVAL_MINUTES', 30)),
  verifyToken: process.env.VERIFY_TOKEN || '',
  jsonBodyLimit: '64kb',
  defaultProjectCount: 30,
  defaultCampaignSize: 12,
  multiSeedList: [42, 7, 99, 123, 2026],
  // Embeddings stay entirely server-side. Without a key the API reports an
  // explicit disabled state instead of falling back to lexical matching.
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  openaiEmbeddingModel:
    process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  semanticSimilarityThreshold: floatFromEnv('SEMANTIC_SIMILARITY_THRESHOLD', 0.86, {
    min: 0.5,
    max: 0.99,
  }),
  semanticMinProjects: Math.max(2, intFromEnv('SEMANTIC_MIN_PROJECTS', 3)),
  semanticMinMembers: Math.max(2, intFromEnv('SEMANTIC_MIN_MEMBERS', 3)),
  semanticMaxClusters: Math.min(
    20,
    Math.max(1, intFromEnv('SEMANTIC_MAX_CLUSTERS', 8)),
  ),
  semanticBatchSize: Math.min(
    256,
    Math.max(1, intFromEnv('SEMANTIC_BATCH_SIZE', 64)),
  ),
  semanticTimeoutMs: Math.max(
    1000,
    intFromEnv('SEMANTIC_TIMEOUT_MS', 20000),
  ),
});
