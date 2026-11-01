import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../app.js';

const SESSION_A = 'visitor-alpha';
const SESSION_B = 'visitor-beta';

const asVisitor = (req, sessionId) =>
  req.set('X-TrustWeave-Session', sessionId);

test('the shared default world is read-only and rejects every write', async () => {
  const before = await request(app).get('/api/health').expect(200);
  assert.equal(before.body.readOnly, true);
  assert.equal(before.body.seed, 42);

  const simulate = await request(app)
    .post('/api/simulate')
    .send({ seed: 7 })
    .expect(403);
  assert.equal(simulate.body.error.code, 'READ_ONLY_WORLD');

  const record = await request(app)
    .post('/api/records')
    .send({
      issuerProjectId: 'p10',
      subjectContributorId: 'c_new_01',
      type: 'vouch',
      reasonCode: 'read_only_check',
      evidence: [{ kind: 'note', ref: 'should not be written' }],
    })
    .expect(403);
  assert.equal(record.body.error.code, 'READ_ONLY_WORLD');

  const after = await request(app).get('/api/health').expect(200);
  assert.deepEqual(after.body.counts, before.body.counts);
});

test('two visitors rebuild, sign and read without affecting each other', async () => {
  const defaultBefore = await request(app).get('/api/health').expect(200);

  const alpha = await asVisitor(request(app).post('/api/simulate'), SESSION_A)
    .send({ seed: 7, size: 20, campaignSize: 10, scenario: 'obvious' })
    .expect(200);
  assert.equal(alpha.body.simulation.seed, 7);
  assert.equal(alpha.body.simulation.size, 20);

  const beta = await asVisitor(request(app).get('/api/health'), SESSION_B).expect(200);
  assert.equal(beta.body.seed, 42);
  assert.equal(beta.body.size, 30);
  assert.equal(beta.body.readOnly, false);

  const unchanged = await request(app).get('/api/health').expect(200);
  assert.deepEqual(unchanged.body.counts, defaultBefore.body.counts);
  assert.equal(unchanged.body.readOnly, true);

  const signed = await asVisitor(request(app).post('/api/records'), SESSION_A)
    .send({
      issuerProjectId: 'p10',
      subjectContributorId: 'c_new_01',
      type: 'vouch',
      reasonCode: 'sandbox_only',
      evidence: [{ kind: 'note', ref: 'alpha sandbox record' }],
    })
    .expect(201);

  const alphaLog = await asVisitor(request(app).get('/api/records'), SESSION_A)
    .query({ projectId: 'p10' })
    .expect(200);
  assert.ok(
    alphaLog.body.log.entries.some((entry) => entry.record.id === signed.body.record.id),
  );

  const betaLog = await asVisitor(request(app).get('/api/records'), SESSION_B)
    .query({ projectId: 'p10' })
    .expect(200);
  assert.ok(
    !betaLog.body.log.entries.some((entry) => entry.record.id === signed.body.record.id),
  );

  const sharedLog = await request(app)
    .get('/api/records')
    .query({ projectId: 'p10' })
    .expect(200);
  assert.ok(
    !sharedLog.body.log.entries.some((entry) => entry.record.id === signed.body.record.id),
  );

  const betaRebuild = await asVisitor(request(app).post('/api/simulate'), SESSION_B)
    .send({ seed: 99, size: 20, campaignSize: 15, scenario: 'stealth' })
    .expect(200);
  assert.equal(betaRebuild.body.simulation.seed, 99);

  const alphaAgain = await asVisitor(request(app).get('/api/health'), SESSION_A).expect(200);
  assert.equal(alphaAgain.body.seed, 7);
  assert.equal(alphaAgain.body.size, 20);
  assert.equal(alphaAgain.body.campaignSize, 10);

  const alphaLogAgain = await asVisitor(request(app).get('/api/records'), SESSION_A)
    .query({ projectId: 'p10' })
    .expect(200);
  assert.ok(
    alphaLogAgain.body.log.entries.some(
      (entry) => entry.record.id === signed.body.record.id,
    ),
  );

  const betaAgain = await asVisitor(request(app).get('/api/health'), SESSION_B).expect(200);
  assert.equal(betaAgain.body.seed, 99);
  assert.equal(betaAgain.body.scenario, 'stealth');

  const sharedAgain = await request(app).get('/api/health').expect(200);
  assert.equal(sharedAgain.body.seed, 42);
  assert.equal(sharedAgain.body.readOnly, true);
  assert.deepEqual(sharedAgain.body.counts, defaultBefore.body.counts);
});

test('an explicit seed in the URL selects a deterministic read-only world', async () => {
  const first = await request(app)
    .get('/api/health')
    .query({ seed: 99, size: 20, campaignSize: 10, scenario: 'stealth' })
    .expect(200);
  assert.equal(first.body.readOnly, true);
  assert.equal(first.body.seed, 99);
  assert.equal(first.body.scenario, 'stealth');

  const second = await request(app)
    .get('/api/projects')
    .query({ seed: 99, size: 20, campaignSize: 10, scenario: 'stealth' })
    .expect(200);
  const simulation = await request(app)
    .get('/api/health')
    .query({ seed: 99, size: 20, campaignSize: 10, scenario: 'stealth' })
    .expect(200);
  assert.deepEqual(simulation.body.counts, first.body.counts);
  assert.equal(second.body.projects.length, 20);

  const defaultWorld = await request(app).get('/api/health').expect(200);
  assert.equal(defaultWorld.body.seed, 42);
  assert.equal(defaultWorld.body.counts.projects, 30);
});

test('a malformed visitor identifier is rejected', async () => {
  const response = await request(app)
    .get('/api/health')
    .set('X-TrustWeave-Session', 'bad id with spaces')
    .expect(400);
  assert.equal(response.body.error.code, 'BAD_REQUEST');
});
