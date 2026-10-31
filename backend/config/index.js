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

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: intFromEnv('PORT', 5000),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  simSeed: intFromEnv('SIM_SEED', 42),
  jsonBodyLimit: '64kb',
  defaultProjectCount: 30,
  defaultCampaignSize: 12,
  multiSeedList: [42, 7, 99, 123, 2026],
});
