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
});
