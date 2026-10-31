import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../app.js';
import { config } from '../config/index.js';

before(async () => {
  await request(app)
    .post('/api/simulate')
    .send({ seed: 42, size: 30, campaignSize: 12 })
    .expect(200);
});

test('GET /api/health reports a simulation host with no authority', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.simulationHost, true);
  assert.equal(response.body.authority, false);
  assert.equal(response.body.simulated, true);
  assert.equal(response.body.seed, 42);
  assert.equal(response.body.counts.projects, 30);
});

test('GET /api/projects returns sanitized project summaries', async () => {
  const response = await request(app).get('/api/projects').expect(200);
  assert.equal(response.body.projects.length, 30);
  const project = response.body.projects.find((item) => item.id === 'p10');
  assert.ok(project);
  assert.equal(project.publicKey, undefined);
  assert.ok(project.publicKeyFingerprint);
  assert.ok(project.trustConfig.length > 0);
  assert.ok(project.trustConfig.every((edge) => edge.weight >= 0 && edge.weight <= 1));
});

test('GET /api/projects/:id/view returns assessments from that project only', async () => {
  const response = await request(app).get('/api/projects/p10/view').expect(200);
  assert.equal(response.body.project.id, 'p10');
  assert.ok(response.body.project.publicKey);
  assert.ok(response.body.effectiveTrust.length > 0);
  assert.ok(response.body.incoming.length > 0);
  assert.equal(
    response.body.summary.contributors,
    response.body.incoming.length,
  );
  assert.ok(
    response.body.incoming.every(
      (item) => item.assessment.evaluatingProjectId === 'p10',
    ),
  );
});

test('the same contributor gets different outcomes as different projects', async () => {
  const trusting = await request(app)
    .get('/api/contributors/c_disputed/assessment')
    .query({ asProject: 'p06' })
    .expect(200);
  const unaware = await request(app)
    .get('/api/contributors/c_disputed/assessment')
    .query({ asProject: 'p08' })
    .expect(200);

  assert.equal(trusting.body.assessment.outcome, 'caution');
  assert.equal(unaware.body.assessment.outcome, 'normal_review');
  assert.ok(
    trusting.body.assessment.reasons.some(
      (reason) => reason.weight > 0 && reason.references.length > 0,
    ),
  );
  assert.ok(trusting.body.assessment.whatWouldChangeThis.length > 0);
});

test('a newcomer with no history is neutral and the malicious denouncement is ignored', async () => {
  const newcomer = await request(app)
    .get('/api/contributors/c_new_good/assessment')
    .query({ asProject: 'p10' })
    .expect(200);
  assert.equal(newcomer.body.assessment.outcome, 'normal_review');
  assert.equal(newcomer.body.assessment.note, 'No history. Treated as neutral.');

  const honest = await request(app)
    .get(`/api/contributors/${encodeURIComponent('c_denounced')}/assessment`)
    .query({ asProject: 'p10' })
    .expect(200);
  assert.equal(honest.body.assessment.outcome, 'normal_review');
  const ignored = honest.body.assessment.reasons.find(
    (reason) =>
      reason.type === 'ignored_record' &&
      reason.references.some((ref) => ref.projectId === 'p01'),
  );
  assert.ok(ignored);
  assert.match(ignored.message, /no evidence attached/i);
});

test('GET /api/campaigns returns the coordinated campaign with evidence', async () => {
  const response = await request(app).get('/api/campaigns').expect(200);
  assert.equal(response.body.campaigns.length, 1);
  const campaign = response.body.campaigns[0];
  assert.equal(campaign.members.length, 12);
  assert.ok(campaign.affectedProjects.length >= 20);
  assert.ok(campaign.signalsFired.length >= 2);
  assert.ok(campaign.signalsFired.every((signal) => signal.evidence.length > 0));
  assert.ok(campaign.timeline.length > 0);
  assert.equal(campaign.confidence.label, 'high');
  assert.ok(response.body.detector.requirement.includes('two independent signal types'));
});

test('GET /api/records verifies logs and shows rejection under tampering', async () => {
  const summary = await request(app).get('/api/records').expect(200);
  assert.ok(summary.body.projects.length === 30);
  assert.equal(summary.body.defaultProjectId, 'p01');

  const clean = await request(app)
    .get('/api/records')
    .query({ projectId: 'p07' })
    .expect(200);
  assert.equal(clean.body.log.valid, true);
  assert.equal(clean.body.log.counts.invalid, 0);
  assert.ok(clean.body.log.entries.every((entry) => entry.verification.active || entry.verification.expired || entry.verification.revoked));

  const signature = await request(app)
    .get('/api/records')
    .query({ projectId: 'p07', tamper: 'signature' })
    .expect(200);
  assert.equal(signature.body.demoOnly, true);
  assert.equal(signature.body.log.valid, false);
  assert.ok(
    signature.body.log.entries.some((entry) =>
      entry.verification.issues.includes('invalid_signature'),
    ),
  );

  const chain = await request(app)
    .get('/api/records')
    .query({ projectId: 'p07', tamper: 'chain' })
    .expect(200);
  assert.equal(chain.body.log.valid, false);
  assert.ok(
    chain.body.log.entries.some((entry) =>
      entry.verification.issues.includes('broken_chain'),
    ),
  );
});

test('POST /api/records signs a new record and a later revoke reverses it', async () => {
  const vouch = await request(app)
    .post('/api/records')
    .send({
      issuerProjectId: 'p10',
      subjectContributorId: 'c_new_01',
      type: 'vouch',
      reasonCode: 'newcomer_sponsor_vouch',
      evidence: [{ kind: 'note', ref: 'simulated sponsor vouch from test' }],
    })
    .expect(201);
  assert.ok(vouch.body.record.signature);
  assert.equal(vouch.body.verification.integrity, 'valid');
  assert.equal(vouch.body.verification.active, true);

  const revoke = await request(app)
    .post('/api/records')
    .send({
      issuerProjectId: 'p10',
      subjectContributorId: 'c_new_01',
      type: 'revoke',
      reasonCode: 'appeal_accepted',
      subjectRecordId: vouch.body.record.id,
      evidence: [{ kind: 'record', ref: vouch.body.record.id }],
    })
    .expect(201);
  assert.ok(revoke.body.record.signature);

  const log = await request(app)
    .get('/api/records')
    .query({ projectId: 'p10' })
    .expect(200);
  const target = log.body.log.entries.find(
    (entry) => entry.record.id === vouch.body.record.id,
  );
  assert.equal(target.verification.revoked, true);
  assert.equal(target.verification.revokedBy, revoke.body.record.id);
  assert.equal(target.verification.active, false);
});

test('API errors use the documented shape', async () => {
  const missingProject = await request(app)
    .get('/api/projects/nope/view')
    .expect(404);
  assert.equal(missingProject.body.error.code, 'NOT_FOUND');
  assert.equal(typeof missingProject.body.error.message, 'string');

  const missingQuery = await request(app)
    .get('/api/contributors/c_new_good/assessment')
    .expect(400);
  assert.equal(missingQuery.body.error.code, 'VALIDATION_ERROR');

  const badSimulation = await request(app)
    .post('/api/simulate')
    .send({ size: 10 })
    .expect(400);
  assert.equal(badSimulation.body.error.code, 'VALIDATION_ERROR');

  const invalidJson = await request(app)
    .post('/api/records')
    .set('Content-Type', 'application/json')
    .send('{"type":')
    .expect(400);
  assert.equal(invalidJson.body.error.code, 'INVALID_JSON');

  const unknown = await request(app).get('/api/nope').expect(404);
  assert.equal(unknown.body.error.code, 'NOT_FOUND');
});

test('CORS is restricted to FRONTEND_ORIGIN', async () => {
  const allowed = await request(app)
    .get('/api/health')
    .set('Origin', config.frontendOrigin)
    .expect(200);
  assert.equal(
    allowed.headers['access-control-allow-origin'],
    config.frontendOrigin,
  );

  const blocked = await request(app)
    .get('/api/health')
    .set('Origin', 'https://evil.example')
    .expect(200);
  assert.equal(blocked.headers['access-control-allow-origin'], undefined);
});

test('GET /api/metrics reports measurements for one seed and across seeds', async () => {
  const current = await request(app).get('/api/metrics').expect(200);
  assert.equal(current.body.metrics.campaign.precision, 1);
  assert.equal(current.body.metrics.campaign.recall, 1);
  assert.equal(current.body.metrics.newcomerFalseFlag.rate, 0);
  assert.equal(current.body.metrics.explanationCompleteness.rate, 1);
  assert.equal(
    current.body.metrics.hardCasesPassed,
    current.body.metrics.hardCasesTotal,
  );

  const multi = await request(app)
    .get('/api/metrics')
    .query({ multi: '1' })
    .expect(200);
  assert.equal(multi.body.multiSeed.aggregate.campaignPrecisionMean, 1);
  assert.equal(multi.body.multiSeed.aggregate.campaignRecallMean, 1);
  assert.equal(multi.body.multiSeed.aggregate.newcomerFalseFlagRateMax, 0);
  assert.equal(multi.body.multiSeed.aggregate.explanationCompletenessMin, 1);
  assert.ok(multi.body.multiSeed.variance.campaignPrecision.range === 0);
});
