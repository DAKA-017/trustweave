import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '../middleware/rate-limit.js';

function fakeRequest(ip, method = 'POST') {
  return { ip, method, url: '/api/simulate' };
}

function fakeResponse() {
  const headers = {};
  return {
    statusCode: 200,
    body: null,
    headers,
    set(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function call(limiter, ip) {
  const req = fakeRequest(ip);
  const res = fakeResponse();
  let passed = false;
  limiter(req, res, () => {
    passed = true;
  });
  return { res, passed };
}

test('public clients are cut off after the limit with a retry hint', () => {
  const limiter = rateLimit({ max: 2, windowMs: 60_000 });
  assert.equal(call(limiter, '203.0.113.9').passed, true);
  assert.equal(call(limiter, '203.0.113.9').passed, true);

  const blocked = call(limiter, '203.0.113.9');
  assert.equal(blocked.passed, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.body.error.code, 'RATE_LIMITED');
  assert.ok(Number(blocked.res.headers['retry-after']) >= 1);
});

test('each client address keeps its own budget', () => {
  const limiter = rateLimit({ max: 1, windowMs: 60_000 });
  assert.equal(call(limiter, '203.0.113.10').passed, true);
  assert.equal(call(limiter, '203.0.113.10').passed, false);
  assert.equal(call(limiter, '203.0.113.11').passed, true);
});

test('loopback and private addresses are never throttled', () => {
  const limiter = rateLimit({ max: 1, windowMs: 60_000 });
  for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.7']) {
    for (let index = 0; index < 5; index += 1) {
      assert.equal(call(limiter, ip).passed, true, `${ip} should pass`);
    }
  }
});

test('the window reopens after it expires', async () => {
  const limiter = rateLimit({ max: 1, windowMs: 30 });
  assert.equal(call(limiter, '203.0.113.12').passed, true);
  assert.equal(call(limiter, '203.0.113.12').passed, false);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(call(limiter, '203.0.113.12').passed, true);
});
