import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { app } from '../app.js';
import { config } from '../config/index.js';
import {
  CHECKS,
  VerificationSandbox,
  runVerification,
} from '../services/verification/index.js';

const EXPECTED_IDS = [
  'persist',
  'load',
  'graph',
  'trust',
  'simulator',
  'campaign',
  'provenance',
  'newcomer',
  'records',
  'revocation',
  'tamper',
  'sign',
];

const stableResults = (run) =>
  run.results.map(({ id, name, passed, details, error }) => ({
    id,
    name,
    passed,
    details,
    error,
  }));

test('all 12 checks pass inside isolated sandboxes', async () => {
  const run = await runVerification();
  assert.equal(run.total, 12);
  assert.deepEqual(
    run.results.map((result) => result.id),
    EXPECTED_IDS,
  );
  for (const result of run.results) {
    assert.deepEqual(
      Object.keys(result).sort(),
      ['details', 'durationMs', 'id', 'name', 'passed'].sort(),
      `${result.id} should return the documented shape`,
    );
    assert.equal(result.passed, true, `${result.id}: ${result.error ?? result.details}`);
    assert.ok(result.details.length > 0, `${result.id} should explain what it checked`);
    assert.ok(Number.isFinite(result.durationMs));
  }
  assert.equal(run.passed, 12);
  assert.equal(run.failed, 0);
  assert.equal(run.ok, true);
});

test('the same seed produces identical results across runs', async () => {
  const first = await runVerification({ world: { seed: 42 } });
  const second = await runVerification({ world: { seed: 42 } });
  assert.deepEqual(stableResults(second), stableResults(first));
});

test('a broken signature makes the records check fail', async () => {
  const sandbox = new VerificationSandbox({ seed: 42 });
  const entry = sandbox.state.records.getLog('p07')[0];
  const first = entry.record.signature.slice(0, 1);
  entry.record = {
    ...entry.record,
    signature: `${first === 'A' ? 'B' : 'A'}${entry.record.signature.slice(1)}`,
  };
  const recordsCheck = CHECKS.find((check) => check.id === 'records');
  const run = await runVerification({
    checks: [recordsCheck],
    sandboxFactory: () => sandbox,
  });
  assert.equal(run.results[0].passed, false);
  assert.match(run.results[0].error, /failed verification/);
});

test('a broken hash chain makes the records check fail', async () => {
  const sandbox = new VerificationSandbox({ seed: 42 });
  const log = sandbox.state.records.getLog('p07');
  const entry = log[Math.floor(log.length / 2)];
  entry.record = {
    ...entry.record,
    reasonCode: `${entry.record.reasonCode}_corrupted`,
  };
  const recordsCheck = CHECKS.find((check) => check.id === 'records');
  const run = await runVerification({
    checks: [recordsCheck],
    sandboxFactory: () => sandbox,
  });
  assert.equal(run.results[0].passed, false);
  assert.match(run.results[0].error, /failed verification/);
});

test('verification routes are read-only and POST stays closed without a token', async () => {
  const latest = await request(app).get('/api/verify/latest').expect(200);
  assert.ok('latest' in latest.body);
  assert.ok('intervalMinutes' in latest.body);

  const history = await request(app).get('/api/verify/history').expect(200);
  assert.ok(Array.isArray(history.body.history));

  const post = await request(app).post('/api/verify/run').expect(403);
  assert.ok(['VERIFY_TOKEN_REQUIRED', 'FORBIDDEN'].includes(post.body.error.code));
  if (!config.verifyToken) {
    assert.equal(post.body.error.code, 'VERIFY_TOKEN_REQUIRED');
  }
});

const FRONTEND_DIR = fileURLToPath(new URL('../../frontend/', import.meta.url));
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'test-results',
  'playwright-report',
  '.screenshots',
  '.vercel',
]);

function frontendFiles(directory = FRONTEND_DIR) {
  const files = [];
  for (const name of readdirSync(directory, { withFileTypes: true })) {
    if (name.isDirectory()) {
      if (SKIP_DIRS.has(name.name)) continue;
      files.push(...frontendFiles(join(directory, name.name)));
    } else if (name.isFile()) {
      files.push(join(directory, name.name));
    }
  }
  return files;
}

test('the frontend never calls verification routes or names the checks', () => {
  const forbidden = [
    '/api/verify',
    'verify/latest',
    'verify/history',
    'verify/run',
    'X-Verify-Token',
    'VERIFY_TOKEN',
    'VerifyView',
    'Live verification',
    ...CHECKS.map((check) => check.name),
  ];
  const offenders = [];
  for (const file of frontendFiles()) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const pattern of forbidden) {
      if (text.includes(pattern)) {
        offenders.push(`${file.replace(FRONTEND_DIR, 'frontend/')} → "${pattern}"`);
      }
    }
  }
  assert.deepEqual(offenders, [], `Verification logic leaked into the frontend:\n${offenders.join('\n')}`);
});
