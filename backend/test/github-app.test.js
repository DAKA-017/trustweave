import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHmac,
  generateKeyPairSync,
  verify as verifyToken,
} from 'node:crypto';
import request from 'supertest';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' });
const WEBHOOK_SECRET = 'webhook-test-secret';

process.env.GITHUB_APP_ID = '123456';
process.env.GITHUB_APP_PRIVATE_KEY = PRIVATE_PEM;
process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.GITHUB_API_BASE_URL = 'https://api.github.test';
process.env.GITHUB_MAX_REPOSITORIES = '3';
process.env.GITHUB_MAX_PRS_PER_REPOSITORY = '40';
process.env.GITHUB_MAX_USER_LOOKUPS = '10';

const { app } = await import('../app.js');
const { createAppJwt, getInstallationToken, resetTokenCache } = await import(
  '../services/github/app-auth.js'
);
const { verifyGithubSignature } = await import(
  '../middleware/verify-github-signature.js'
);
const { assessPullRequest, resetIngestCache } = await import(
  '../services/github/ingest.js'
);
const { formatAssessment } = await import('../services/github/check-run.js');
const { drainGithubQueue, resetGithubWebhookState } = await import(
  '../routes/github.js'
);

const originalFetch = globalThis.fetch;
const calls = [];
let nextCheckRunId = 900;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const now = Date.now();
const ago = (ms) => new Date(now - ms).toISOString();

const REPOSITORIES = ['o/a', 'o/b', 'o/c'].map((fullName) => {
  const [owner, name] = fullName.split('/');
  return {
    full_name: fullName,
    name,
    owner: { login: owner },
    archived: false,
    disabled: false,
  };
});

const AUTHORS = ['spammer', 'accomplice1', 'accomplice2'];
const CONTENT =
  'fix: update documentation\n\nThis pull request updates the project documentation.';

function pullsFor(fullName) {
  const pullRequests = [];
  for (const login of AUTHORS) {
    for (let index = 0; index < 10; index += 1) {
      const repository = REPOSITORIES[index % REPOSITORIES.length];
      if (repository.full_name !== fullName) continue;
      pullRequests.push({
        number: 100 + index + AUTHORS.indexOf(login) * 10,
        title: 'Update documentation',
        body: CONTENT,
        state: 'open',
        merged_at: null,
        created_at: ago(90 * MINUTE),
        updated_at: ago((index + 1) * MINUTE),
        html_url: `https://github.com/${fullName}/pull/${100 + index}`,
        user: { login, type: 'User' },
      });
    }
  }
  return pullRequests;
}

const respond = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

async function mockFetch(url, options = {}) {
  const target = new URL(String(url));
  const method = options.method ?? 'GET';
  calls.push({
    method,
    path: target.pathname + target.search,
    body: options.body ? JSON.parse(options.body) : null,
  });

  if (method === 'POST' && /^\/app\/installations\/\d+\/access_tokens$/.test(target.pathname)) {
    return respond({
      token: 'ghs_test_token',
      expires_at: new Date(Date.now() + 60 * MINUTE).toISOString(),
    });
  }
  if (method === 'GET' && /^\/app\/installations\/\d+$/.test(target.pathname)) {
    const id = target.pathname.split('/').pop();
    if (id === '1') {
      return respond({
        id: 1,
        account: { login: 'octo-org' },
        repository_selection: 'all',
      });
    }
    if (id === '2') {
      return respond({
        id: 2,
        account: { login: '<script>alert(1)</script>' },
        repository_selection: 'selected',
      });
    }
    return respond({ message: 'Not Found' }, 404);
  }
  if (target.pathname === '/installation/repositories') {
    return respond({ repositories: REPOSITORIES });
  }
  if (target.pathname.startsWith('/users/')) {
    return respond({
      login: decodeURIComponent(target.pathname.split('/')[2]),
      created_at: ago(5 * DAY),
    });
  }
  if (/^\/repos\/[^/]+\/[^/]+\/pulls$/.test(target.pathname)) {
    const [, , owner, name] = target.pathname.split('/');
    return respond(pullsFor(`${owner}/${name}`));
  }
  if (method === 'POST' && target.pathname.endsWith('/check-runs')) {
    nextCheckRunId += 1;
    return respond({ id: nextCheckRunId });
  }
  if (method === 'PATCH' && /\/check-runs\/\d+$/.test(target.pathname)) {
    return respond({ id: Number(target.pathname.split('/').pop()) });
  }
  return respond({ message: `unexpected ${method} ${target.pathname}` }, 404);
}

const checkRunCalls = () =>
  calls.filter((call) => call.path.includes('/check-runs'));

function fakeResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function pullRequestPayload({ action = 'opened', draft = false, delivery } = {}) {
  return {
    action,
    delivery,
    installation: { id: 1 },
    repository: {
      owner: { login: 'o' },
      name: 'a',
      full_name: 'o/a',
    },
    pull_request: {
      number: 42,
      draft,
      head: { sha: 'abc123headsha' },
      user: { login: 'spammer' },
      html_url: 'https://github.com/o/a/pull/42',
    },
  };
}

function postWebhook(payload, { delivery = 'delivery-1', signature } = {}) {
  const body = JSON.stringify(payload);
  const signed = signature ?? `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')}`;
  return request(app)
    .post('/api/github/webhook')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', 'pull_request')
    .set('X-GitHub-Delivery', delivery)
    .set('X-Hub-Signature-256', signed)
    .send(body);
}

beforeEach(() => {
  calls.length = 0;
  resetTokenCache();
  resetIngestCache();
  resetGithubWebhookState();
  globalThis.fetch = mockFetch;
});

after(() => {
  globalThis.fetch = originalFetch;
});

test('the app JWT is RS256 and verifies against the public key', () => {
  const at = Date.parse('2026-11-01T12:00:00.000Z');
  const token = createAppJwt({ now: at });
  const [header, payload, signature] = token.split('.');

  assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'RS256');
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.iss, '123456');
  assert.ok(claims.exp - claims.iat <= 600);
  assert.ok(claims.iat <= Math.floor(at / 1000));

  assert.equal(
    verifyToken(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      PUBLIC_PEM,
      Buffer.from(signature, 'base64url'),
    ),
    true,
  );
});

test('installation tokens are cached instead of requested per call', async () => {
  const first = await getInstallationToken(1, { fetchImpl: mockFetch });
  const second = await getInstallationToken(1, { fetchImpl: mockFetch });

  assert.equal(first, 'ghs_test_token');
  assert.equal(second, first);
  assert.equal(
    calls.filter((call) => call.path.endsWith('/access_tokens')).length,
    1,
  );
});

test('signature verification rejects a wrong or missing signature', () => {
  const middleware = verifyGithubSignature({ secret: WEBHOOK_SECRET });
  const body = Buffer.from('{"ok":true}');

  let nextCalled = false;
  const bad = fakeResponse();
  middleware(
    { body, get: () => `sha256=${'0'.repeat(64)}` },
    bad,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, false);
  assert.equal(bad.statusCode, 401);
  assert.equal(bad.payload.error.code, 'INVALID_SIGNATURE');

  const missing = fakeResponse();
  middleware({ body, get: () => undefined }, missing, () => {
    nextCalled = true;
  });
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.payload.error.code, 'MISSING_SIGNATURE');

  const good = fakeResponse();
  const signature = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')}`;
  middleware({ body, get: () => signature }, good, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('real pull request metadata maps into a detected campaign', async () => {
  const assessment = await assessPullRequest({
    installationId: 1,
    owner: 'o',
    name: 'a',
    author: 'spammer',
    fetchImpl: mockFetch,
  });

  assert.equal(assessment.counts.repositories, 3);
  assert.equal(assessment.counts.pullRequests, 30);
  assert.ok(assessment.campaign);
  const types = assessment.campaign.signalsFired.map((signal) => signal.type);
  assert.ok(types.includes('near_duplicate_content'));
  assert.ok(types.includes('high_volume_low_merge'));
  assert.deepEqual(assessment.campaign.memberContributorIds.sort(), [
    'accomplice1',
    'accomplice2',
    'spammer',
  ]);
  assert.ok(
    assessment.campaign.evidence.every((ref) =>
      assessment.pullRequestsById.has(ref.id),
    ),
  );

  const report = formatAssessment(assessment);
  assert.equal(report.conclusion, 'action_required');
  assert.match(report.text, /near_duplicate_content/);
  assert.match(report.text, /no merge is blocked/);
});

test('an isolated author gets a neutral check, never a failure', async () => {
  const assessment = await assessPullRequest({
    installationId: 1,
    owner: 'o',
    name: 'a',
    author: 'nobody-in-this-world',
    fetchImpl: mockFetch,
  });

  assert.equal(assessment.campaign, null);
  assert.deepEqual(assessment.signals, []);
  const report = formatAssessment(assessment);
  assert.equal(report.conclusion, 'neutral');
  assert.match(report.summary, /No campaign-level pattern/);
});

test('the summary pluralizes the scope at one', () => {
  const report = formatAssessment({
    author: 'solo',
    campaign: null,
    signals: [],
    counts: { pullRequests: 1, repositories: 1, lookbackDays: 1 },
    pullRequestsById: new Map(),
  });

  assert.match(
    report.summary,
    /Checked 1 pull request across 1 repository \(last 1 day\) for @solo\./,
  );
});

test('a signed pull_request webhook posts and completes the check run', async () => {
  const response = await postWebhook(pullRequestPayload());
  assert.equal(response.status, 202);
  await drainGithubQueue();

  const [created, completed] = checkRunCalls();
  assert.equal(created.method, 'POST');
  assert.equal(created.body.name, 'TrustWeave');
  assert.equal(created.body.head_sha, 'abc123headsha');
  assert.equal(created.body.status, 'in_progress');

  assert.equal(completed.method, 'PATCH');
  assert.equal(completed.path, '/repos/o/a/check-runs/901');
  assert.equal(completed.body.conclusion, 'action_required');
  assert.match(completed.body.output.summary, /Possibly coordinated/);
  assert.match(completed.body.output.text, /near_duplicate_content/);
  assert.match(completed.body.details_url, /\/network$/);
});

test('an unsigned webhook is rejected without calling GitHub', async () => {
  const response = await postWebhook(pullRequestPayload(), {
    signature: `sha256=${'a'.repeat(64)}`,
  });
  assert.equal(response.status, 401);
  await drainGithubQueue();
  assert.equal(calls.length, 0);
});

test('a redelivered webhook is acknowledged but processed once', async () => {
  const payload = pullRequestPayload();
  await postWebhook(payload, { delivery: 'delivery-duplicate' }).expect(202);
  const second = await postWebhook(payload, { delivery: 'delivery-duplicate' });
  assert.equal(second.status, 202);
  assert.equal(second.body.duplicate, true);

  await drainGithubQueue();
  assert.equal(
    calls.filter((call) => call.method === 'POST' && call.path.endsWith('/check-runs'))
      .length,
    1,
  );
});

test('draft pull requests get a neutral check that skips analysis', async () => {
  await postWebhook(pullRequestPayload({ draft: true })).expect(202);
  await drainGithubQueue();

  assert.equal(
    calls.filter((call) => call.path.includes('/pulls')).length,
    0,
  );
  const completed = checkRunCalls().find((call) => call.method === 'PATCH');
  assert.equal(completed.body.conclusion, 'neutral');
  assert.equal(completed.body.output.title, 'Draft pull request');
});

test('actions outside the handled set are acknowledged and ignored', async () => {
  const response = await postWebhook(pullRequestPayload({ action: 'closed' }));
  assert.equal(response.status, 202);
  assert.equal(response.body.ignored, true);
  await drainGithubQueue();
  assert.equal(calls.length, 0);
});

test('the setup URL renders an escaped post-install page', async () => {
  const response = await request(app)
    .get('/api/github/setup?installation_id=2')
    .expect(200);

  assert.match(response.headers['content-type'], /text\/html/);
  assert.match(response.text, /TrustWeave is installed/);
  assert.match(response.text, /selected repositories/);
  assert.match(response.headers['content-security-policy'], /default-src 'none'/);
  assert.match(response.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(response.text.includes('<script>alert(1)</script>'), false);
  assert.equal(response.text.includes('ghs_test_token'), false);
});

test('the setup URL answers JSON for tooling', async () => {
  const response = await request(app)
    .get('/api/github/setup?installation_id=1')
    .set('Accept', 'application/json')
    .expect(200);

  assert.deepEqual(response.body, {
    installed: true,
    installationId: '1',
    account: 'octo-org',
    repositorySelection: 'all',
  });
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('the setup URL rejects a missing or unknown installation', async () => {
  await request(app).get('/api/github/setup').expect(400);
  await request(app).get('/api/github/setup?installation_id=abc').expect(400);
  const unknown = await request(app)
    .get('/api/github/setup?installation_id=999')
    .expect(404);
  assert.equal(unknown.body.error.code, 'UNKNOWN_INSTALLATION');
});
